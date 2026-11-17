const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const jobsStore = require('./jobs');
const {
    GREEN, ORANGE, RED, customId, threadLink,
    buildReviewMessage, buildBusyMessage, stuckMessage, buildReport, buildProceedModal, completionNote,
} = require('./reviewMessages');
const filer = require('./filer');
const { getProtectionReason } = require('./guards');
const { reportError } = require('../../shared/utilities/errorReporter');
const { formatStamp } = require('../../shared/transcript');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../../data/channels');

const { PHASES } = jobsStore;

const REMINDER_AFTER_MS = 72 * 60 * 60 * 1000;
const REMINDER_CHECK_MS = 30 * 60 * 1000;
const NO_MENTIONS = { parse: [] };
const GREY = 0x95A5A6;

let starting = false;

async function logToControl(client, title, description, color = GREY) {
    try {
        const channel = await getControlChannel(client);
        const embed = new EmbedBuilder().setTitle(title).setDescription(description.slice(0, 4000)).setColor(color).setTimestamp();
        await channel.send({ embeds: [embed], allowedMentions: NO_MENTIONS });
    } catch (err) {
        console.warn('[channelFileReview] Control channel log failed:', err.message);
    }
}

async function getControlChannel(client) {
    return client.channels.fetch(GUILDMASTER_CTRL_CHANNEL_ID);
}

async function fetchControlMessage(client, job) {
    try {
        const channel = await client.channels.fetch(job.controlChannelId ?? GUILDMASTER_CTRL_CHANNEL_ID);
        return await channel.messages.fetch(job.controlMessageId);
    } catch {
        return null;
    }
}

async function sendLong(channel, text) {
    let current = '';
    for (const line of text.split('\n')) {
        if ((current + '\n' + line).length > 1900) {
            await channel.send({ content: current, allowedMentions: NO_MENTIONS });
            current = line;
        } else {
            current = current ? `${current}\n${line}` : line;
        }
    }
    if (current) await channel.send({ content: current, allowedMentions: NO_MENTIONS });
}

async function lockButtons(client, job, text) {
    await updateControlMessage(client, job, buildBusyMessage(job, text));
}

async function updateControlMessage(client, job, payload) {
    const message = await fetchControlMessage(client, job);
    if (message) await message.edit({ content: '', ...payload }).catch(err => console.warn('[channelFileReview] Could not edit the control message:', err.message));
    return message;
}

async function startJob(client, { guild, target, location, isPrivate, userId }) {
    if (starting || jobsStore.getRunningJob()) return { error: 'Another filing is running right now. Wait for it to reach review, then try again.' };
    if (jobsStore.getActiveJobForTarget(target.id)) return { error: 'A filing for this channel is already in progress.' };

    starting = true;
    try {
        const control = await getControlChannel(client);
        const message = await control.send({ content: `⏳ **Filing #${target.name}**\nStarting…`, allowedMentions: NO_MENTIONS });

        const job = await jobsStore.createJob({
            guildId: guild.id,
            targetId: target.id,
            targetName: target.name,
            targetType: target.type,
            locationId: location.id,
            isPrivate,
            startedBy: userId,
            startedAt: Date.now(),
            controlChannelId: control.id,
            controlMessageId: message.id,
            createdThreads: [],
            lockedThreadIds: [],
        });

        await logToControl(client, '🗄️ Channel filing started', `<@${userId}> started filing **#${target.name}** into <#${location.id}> (${isPrivate ? 'private' : 'public'}).`);
        runJob(client, job.id, message).catch(err => console.error('[channelFileReview] runJob crashed:', err));
        return { job };
    } finally {
        starting = false;
    }
}

async function runJob(client, jobId, message) {
    const job = jobsStore.getJob(jobId);
    const progress = filer.createProgress(message, `Filing #${job.targetName}`);

    try {
        await progress.set('Freezing the channel…', { force: true });
        const target = await client.channels.fetch(job.targetId);
        const freeze = await filer.freezeTarget(client, job, target);

        await jobsStore.updateJob(jobId, { phase: PHASES.filing, freezeIssues: freeze.issues });
        const result = await filer.fileChannel(client, jobsStore.getJob(jobId), {
            progress,
            onThreadCreated: async created => {
                const current = jobsStore.getJob(jobId);
                await jobsStore.updateJob(jobId, {
                    createdThreads: [...current.createdThreads, created],
                    ...(created.kind === 'main' ? { mainThreadId: created.id } : {}),
                });
            },
        });

        await jobsStore.saveManifest(jobId, result.manifest);
        await jobsStore.updateJob(jobId, {
            phase: PHASES.verifying,
            counts: result.counts,
            lost: result.lost,
            privateReport: result.privateReport,
            mainThreadId: result.mainThreadId,
        });

        const verification = await filer.verifyFiled(client, jobsStore.getJob(jobId), result.manifest, { progress, batchStats: result.batchStats });
        const merged = filer.createSnagList(result.snags.list);
        for (const snag of verification.snags.list) merged.add(snag.kind, snag.message, snag);

        await jobsStore.updateJob(jobId, {
            phase: PHASES.review,
            verified: true,
            checks: verification.checks,
            snags: merged.list,
            snagOverflow: result.snags.overflow + verification.snags.overflow + merged.overflow,
            reviewReadyAt: Date.now(),
        });

        await postReview(client, jobId, message);
    } catch (err) {
        await reportError(client, {
            scope: '[channelFile]',
            message: `Filing of #${job.targetName} failed and is being reverted`,
            error: err,
            context: { Job: jobId.slice(0, 8), Target: `<#${job.targetId}>` },
        });
        await revertAndReport(client, jobId, `Filing failed: ${err.message}`, { failed: true });
    }
}

async function postReview(client, jobId, progressMessage) {
    const job = jobsStore.getJob(jobId);
    const control = await getControlChannel(client);
    const cmdRole = process.env.CMD_ROLE_ID;

    const review = await control.send({
        content: cmdRole ? `<@&${cmdRole}> a channel filing is ready for review.` : 'A channel filing is ready for review.',
        allowedMentions: cmdRole ? { roles: [cmdRole] } : NO_MENTIONS,
        ...buildReviewMessage(job),
    });
    await jobsStore.updateJob(jobId, { controlMessageId: review.id, controlChannelId: control.id });
    await progressMessage?.delete().catch(() => {});

    const snagCount = (job.snags?.length ?? 0) + (job.snagOverflow ?? 0);
    await logToControl(client, '🗄️ Channel filing ready for review', `**#${job.targetName}** — ${snagCount} snag(s), ${job.lost?.count ?? 0} file(s) not preserved. ${review.url}`, snagCount ? ORANGE : GREEN);
}

async function revertAndReport(client, jobId, reason, { failed = false, by } = {}) {
    const job = jobsStore.getJob(jobId);
    if (!job) return { ok: true, problems: [], threads: [] };

    const result = await filer.hardRevert(client, jobId, reason);

    if (!result.ok) {
        const stuck = jobsStore.getJob(jobId) ?? job;
        const payload = stuckMessage(stuck, reason, result.problems);
        const message = await fetchControlMessage(client, job);
        if (message) await message.edit({ content: '', ...payload }).catch(() => {});
        else (await getControlChannel(client)).send({ ...payload }).catch(() => {});
        await logToControl(client, '🚨 Channel filing revert incomplete', `**#${job.targetName}** — ${result.problems.join('; ')}`, RED);
        return result;
    }

    const threadList = result.threads.length
        ? `\n\nThe filed copies were kept and renamed "aborted" — delete them when you like:\n${result.threads.map(id => `• <#${id}>`).join('\n')}`
        : '';
    const embed = new EmbedBuilder()
        .setTitle(failed ? '❌ Channel filing failed — reverted' : '🛑 Channel filing aborted')
        .setColor(failed ? RED : GREY)
        .setDescription(`**Channel:** #${job.targetName}\n${failed ? reason : `Aborted${by ? ` by <@${by}>` : ''}.`}\n\nThe channel is unfrozen and its permissions are restored. Nothing was deleted.${threadList}`.slice(0, 4000))
        .setTimestamp();
    await updateControlMessage(client, job, { embeds: [embed], components: [] });
    await logToControl(client, failed ? '❌ Channel filing failed' : '🛑 Channel filing aborted', `**#${job.targetName}** — ${failed ? reason : `aborted by <@${by}>`}`, failed ? RED : GREY);
    return result;
}

// ─── Button actions ─────────────────────────────────────────────────────────
async function showErrors(interaction, job) {
    const report = buildReport(job);
    if (report.length <= 1900) {
        await interaction.reply({ content: `\`\`\`\n${report}\n\`\`\``.slice(0, 2000), flags: 64 });
        return;
    }
    await interaction.reply({
        content: 'The report is long, so it is attached as a file.',
        files: [new AttachmentBuilder(Buffer.from(report, 'utf8'), { name: `filing-report-${job.id.slice(0, 8)}.txt` })],
        flags: 64,
    });
}

async function lockFiledThreads(client, job) {
    if (!job.mainThreadId) return;
    try {
        const thread = await client.channels.fetch(job.mainThreadId);
        await thread.setLocked(true, `Channel filing ${job.id.slice(0, 8)}: complete`);
        await thread.setArchived(true, `Channel filing ${job.id.slice(0, 8)}: complete`);
    } catch (err) {
        console.warn('[channelFileReview] Could not lock/archive the filed thread:', err.message);
    }
}

async function finishDeleted(client, job, { by, note } = {}) {
    await jobsStore.updateJob(job.id, { phase: PHASES.done }).catch(() => {});
    const final = jobsStore.getJob(job.id) ?? job;

    const embed = new EmbedBuilder()
        .setTitle('✅ Channel filed and deleted')
        .setColor(GREEN)
        .setDescription([
            `**Channel:** #${job.targetName}`,
            `**Filed copy:** ${threadLink(job.guildId, job.mainThreadId)}`,
            by ? `**Approved by:** <@${by}> at ${formatStamp(Date.now())}` : null,
            note ?? null,
        ].filter(Boolean).join('\n'))
        .setTimestamp();
    await updateControlMessage(client, final, { embeds: [embed], components: [] });

    try {
        await sendLong(await getControlChannel(client), completionNote(final));
    } catch (err) {
        console.warn('[channelFileReview] Could not post the completion note:', err.message);
    }

    await lockFiledThreads(client, final);
    await logToControl(client, '🗄️ Channel filing complete', `**#${job.targetName}** was deleted${by ? ` after approval by <@${by}>` : ''}.`, GREEN);
    await jobsStore.removeJob(job.id);
}

async function proceed(client, interaction, jobId) {
    await interaction.deferReply({ flags: 64 });

    const job = jobsStore.getJob(jobId);
    if (!job || job.phase !== PHASES.review) {
        await interaction.editReply('❌ This filing is no longer waiting for review.');
        return;
    }
    if (job.failed) {
        await interaction.editReply('❌ This filing failed and cannot be completed. Press **Abort** to retry the revert.');
        return;
    }
    if (interaction.fields.getTextInputValue('confirmName').trim() !== job.targetName) {
        await interaction.editReply(`❌ That does not match the channel name (\`${job.targetName}\`). Nothing was deleted.`);
        return;
    }

    const moved = await jobsStore.transitionJob(jobId, [PHASES.review], { phase: PHASES.proceeding, proceededBy: interaction.user.id, proceededAt: Date.now() });
    if (!moved.ok) {
        await interaction.editReply('❌ Someone else is already proceeding with this filing.');
        return;
    }
    await lockButtons(client, moved.job, 'Re-checking the channel, then deleting it…');

    const backToReview = async (reply, { deleteError } = {}) => {
        const restored = await jobsStore.updateJob(jobId, { phase: PHASES.review, proceededBy: null, ...(deleteError ? { lastDeleteError: deleteError } : {}) });
        const payload = buildReviewMessage(restored);
        if (deleteError) {
            payload.embeds[0].addFields({ name: '❌ Delete failed', value: `${deleteError}\nEverything is already filed. Press **Proceed** to retry.`.slice(0, 1024) });
        }
        await updateControlMessage(client, restored, payload);
        await interaction.editReply(reply);
    };

    let deleted = false;
    try {
        let target;
        try {
            target = await client.channels.fetch(job.targetId);
        } catch (err) {
            if (err.status === 404 || err.code === 10003) {
                await interaction.editReply('ℹ️ The original channel no longer exists, so the filing is being closed out.');
                await finishDeleted(client, jobsStore.getJob(jobId) ?? job, { by: interaction.user.id, note: '*The original channel was already gone.*' });
                return;
            }
            throw err;
        }

        const protection = getProtectionReason(interaction.guild, target, { locationId: job.locationId });
        if (protection) {
            await backToReview(`❌ This channel is now protected (${protection}), so it cannot be deleted. Nothing was deleted.`);
            return;
        }

        const gate = jobsStore.assertDeletable(jobId);
        if (!gate.ok) {
            await backToReview(`❌ The safety check refused the deletion: ${gate.reason} Nothing was deleted.`);
            return;
        }

        try {
            await target.delete(`Filed by ${interaction.user.tag} (filing ${jobId.slice(0, 8)})`);
        } catch (err) {
            await logToControl(client, '❌ Channel deletion failed', `**#${job.targetName}** — ${err.message}`, RED);
            await backToReview(`❌ Discord refused to delete the channel: ${err.message}\nEverything is already filed — you can press **Proceed** again to retry.`, { deleteError: err.message });
            return;
        }
        deleted = true;

        await interaction.editReply('✅ The channel was deleted. The filed copy is in place.').catch(() => {});
        await finishDeleted(client, jobsStore.getJob(jobId) ?? job, { by: interaction.user.id });
    } catch (err) {
        if (!deleted) await backToReview(`❌ Something went wrong before anything was deleted: ${err.message}`).catch(() => {});
        throw err;
    }
}

async function abort(client, interaction, jobId) {
    await interaction.deferReply({ flags: 64 });
    const job = jobsStore.getJob(jobId);
    if (!job || ![PHASES.review, PHASES.unrecoverable].includes(job.phase)) {
        await interaction.editReply('❌ This filing is no longer waiting for review.');
        return;
    }

    if (job.phase === PHASES.review) {
        const claimed = await jobsStore.transitionJob(jobId, [PHASES.review], { phase: PHASES.aborting });
        if (!claimed.ok) {
            await interaction.editReply('❌ This filing is no longer waiting for review.');
            return;
        }
        await lockButtons(client, claimed.job, 'Reverting — unfreezing the channel and restoring its permissions…');
    }

    const result = await revertAndReport(client, jobId, `Aborted by <@${interaction.user.id}>`, { by: interaction.user.id });
    await interaction.editReply(result.ok
        ? '🛑 Aborted. The channel is unfrozen and its permissions are restored.'
        : `⚠️ The revert is incomplete: ${result.problems.join('; ')}`);
}

async function rerun(client, interaction, jobId) {
    await interaction.deferReply({ flags: 64 });

    const moved = await jobsStore.transitionJob(jobId, [PHASES.review], { phase: PHASES.verifying });
    if (!moved.ok) {
        await interaction.editReply('❌ This filing is not waiting for review (or checks are already running).');
        return;
    }
    await lockButtons(client, moved.job, 'Re-running the checks: reading the filed copy back and scanning the source again…');

    const restore = async () => {
        const current = jobsStore.getJob(jobId);
        if (current) await updateControlMessage(client, current, buildReviewMessage(current));
    };
    const reply = text => interaction.editReply(text).catch(() => {});

    const job = moved.job;
    const manifest = jobsStore.loadManifest(jobId);
    if (!manifest) {
        await jobsStore.updateJob(jobId, { phase: PHASES.review });
        await restore();
        await reply('❌ The filing manifest is missing, so the checks cannot be re-run. You can still Abort.');
        return;
    }

    try {
        const verification = await filer.verifyFiled(client, job, manifest);
        const kept = (job.snags ?? []).filter(s => ['lost-file', 'note', 'freeze'].includes(s.kind));
        const merged = filer.createSnagList(kept);
        for (const snag of verification.snags.list) merged.add(snag.kind, snag.message, snag);

        await jobsStore.updateJob(jobId, {
            phase: PHASES.review,
            checks: verification.checks,
            snags: merged.list,
            snagOverflow: merged.overflow,
        });
        await restore();
        await reply('🔁 Checks re-run. The review message has been updated.');
    } catch (err) {
        await jobsStore.updateJob(jobId, { phase: PHASES.review });
        await restore();
        await reply(`❌ The re-check failed: ${err.message}. Nothing was changed.`);
    }
}

// ─── Reminders and recovery ─────────────────────────────────────────────────
async function sendReminders(client) {
    const now = Date.now();
    for (const job of jobsStore.listJobs()) {
        if (job.phase !== PHASES.review || job.failed) continue;
        const since = job.lastReminderAt ?? job.reviewReadyAt ?? 0;
        if (!since || now - since < REMINDER_AFTER_MS) continue;

        try {
            const control = await getControlChannel(client);
            const cmdRole = process.env.CMD_ROLE_ID;
            const hours = Math.floor((now - (job.reviewReadyAt ?? since)) / 3600000);
            await control.send({
                content: `${cmdRole ? `<@&${cmdRole}> ` : ''}⏰ **#${job.targetName}** has been frozen and waiting for review for about ${hours} hours. Please press **Proceed** or **Abort** on the review message: ${(await fetchControlMessage(client, job))?.url ?? '(message not found)'}`,
                allowedMentions: cmdRole ? { roles: [cmdRole] } : NO_MENTIONS,
            });
            await jobsStore.updateJob(job.id, { lastReminderAt: now });
        } catch (err) {
            console.warn('[channelFileReview] Reminder failed:', err.message);
        }
    }
}

async function recoverJobs(client) {
    let jobs;
    try {
        jobs = jobsStore.loadAll();
    } catch (err) {
        await reportError(client, { scope: '[channelFile]', message: 'Could not load the channel filing jobs', error: err });
        return;
    }

    for (const job of jobs) {
        try {
            if (job.phase === PHASES.unrecoverable) {
                const control = await getControlChannel(client);
                const payload = stuckMessage(job, 'The job file is unreadable, so the filing state was lost.', [
                    job.hasSnapshot ? `The channel's permission snapshot is intact — Abort will restore it${job.targetId ? ` (<#${job.targetId}>)` : ''}.` : 'No permission snapshot was found.',
                ]);
                payload.embeds[0].setDescription(payload.embeds[0].data.description.replace('#unknown', 'unknown channel'));
                await control.send(payload);
            } else if (job.phase === PHASES.verifying && job.verified) {
                // A "Re-run checks" was interrupted. The filing itself is complete, so go back to review.
                const back = await jobsStore.updateJob(job.id, { phase: PHASES.review });
                await updateControlMessage(client, back, buildReviewMessage(back));
            } else if ([PHASES.freezing, PHASES.filing, PHASES.verifying, PHASES.aborting].includes(job.phase)) {
                await revertAndReport(client, job.id, 'The bot restarted while filing was in progress. The filing was reverted — run the command again.', { failed: true });
            } else if (job.phase === PHASES.proceeding) {
                const exists = await client.channels.fetch(job.targetId).then(() => true).catch(err => (err.status === 404 || err.code === 10003 ? false : true));
                if (!exists) {
                    await finishDeleted(client, job, { by: job.proceededBy, note: '*The bot restarted during the final step; the channel was already deleted.*' });
                } else {
                    const back = await jobsStore.updateJob(job.id, { phase: PHASES.review, proceededBy: null });
                    await updateControlMessage(client, back, buildReviewMessage(back));
                }
            }
        } catch (err) {
            await reportError(client, { scope: '[channelFile]', message: `Could not recover job ${job.id.slice(0, 8)}`, error: err });
        }
    }
}

function init(client) {
    client.once('clientReady', () => {
        recoverJobs(client).catch(err => console.error('[channelFileReview] Recovery failed:', err));
        setInterval(() => sendReminders(client).catch(() => {}), REMINDER_CHECK_MS).unref();
    });
}

module.exports = {
    customId,
    startJob,
    runJob,
    buildReviewMessage,
    buildProceedModal,
    showErrors,
    proceed,
    abort,
    rerun,
    recoverJobs,
    init,
};
