const { ChannelType, AttachmentBuilder } = require('discord.js');
const archive = require('../archiveChannel');
const jobsStore = require('../channelFileJobs');
const { THREAD_TYPES } = require('../channelFileGuards');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../../data/channels');

// ─── Freeze / unfreeze ──────────────────────────────────────────────────────
async function freezeTarget(client, job, target) {
    const isThread = THREAD_TYPES.includes(target.type);
    const reason = `Channel filing ${job.id.slice(0, 8)}: frozen`;

    const snapshot = isThread
        ? { channelId: target.id, guildId: target.guild.id, takenAt: Date.now(), overwrites: [], thread: true }
        : archive.snapshotOverwrites(target);
    await jobsStore.saveSnapshot(job.id, snapshot);

    try {
        const control = await client.channels.fetch(GUILDMASTER_CTRL_CHANNEL_ID);
        await control.send({
            content: `🔐 Permission backup for filing \`${job.id.slice(0, 8)}\` (**${target.name}**)`,
            files: [new AttachmentBuilder(Buffer.from(JSON.stringify(snapshot, null, 2)), { name: `permissions-${job.id.slice(0, 8)}.json` })],
        });
    } catch (err) {
        console.warn('[channelFiler] Could not post the permission backup:', err.message);
    }

    const locked = [];
    const issues = [];
    try {
        if (isThread) {
            if (!target.locked) {
                try {
                    await target.setLocked(true, reason);
                    locked.push(target.id);
                } catch (err) {
                    issues.push(`The thread could not be locked (${err.message}). Messages posted while filing runs will not be copied.`);
                }
            }
        } else {
            try {
                const result = await archive.lockChannelToReadOnly(target, {
                    reason,
                    includeTextBits: [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(target.type),
                });
                if (result?.skipped?.length) {
                    issues.push(`${result.skipped.length} role/member override(s) could not be made read-only, so those people may still be able to post in the channel.`);
                }
            } catch (err) {
                issues.push(`The channel could not be made read-only (${err.message}). Messages posted while filing runs will not be copied and will be lost if you proceed.`);
            }

            if (target.threads?.fetchActive) {
                let failedThreads = 0;
                try {
                    const active = await target.threads.fetchActive();
                    for (const thread of active.threads.values()) {
                        if (thread.locked) continue;
                        try {
                            await thread.setLocked(true, reason);
                            locked.push(thread.id);
                        } catch (err) {
                            failedThreads++;
                            console.warn(`[channelFiler] Could not lock thread ${thread.id}:`, err.message);
                        }
                    }
                } catch (err) {
                    issues.push(`The active threads could not be listed to lock them (${err.message}).`);
                }
                if (failedThreads) issues.push(`${failedThreads} active thread(s) could not be locked, so they may still receive messages.`);
            }
        }
    } finally {
        await jobsStore.updateJob(job.id, { lockedThreadIds: locked });
    }

    return { issues };
}

async function unfreezeTarget(client, job) {
    const problems = [];
    const snapshot = jobsStore.loadSnapshot(job.id);

    if (snapshot && !snapshot.thread) {
        try {
            const channel = await client.channels.fetch(job.targetId);
            const result = await archive.restoreOverwrites(channel, snapshot, { reason: `Channel filing ${job.id.slice(0, 8)}: restoring permissions` });
            if (!result.ok) {
                problems.push(`Permissions were not fully restored (${result.failed.map(f => `${f.action} ${f.id}: ${f.error}`).join('; ') || 'verification failed'})`);
            }
        } catch (err) {
            problems.push(`Could not restore permissions: ${err.message}`);
        }
    }

    for (const id of job.lockedThreadIds ?? []) {
        try {
            const thread = await client.channels.fetch(id);
            if (thread?.locked) await thread.setLocked(false, `Channel filing ${job.id.slice(0, 8)}: unlocking`);
        } catch (err) {
            if (err.status !== 404) problems.push(`Could not unlock <#${id}>: ${err.message}`);
        }
    }

    return problems;
}

module.exports = {
    freezeTarget,
    unfreezeTarget,
};
