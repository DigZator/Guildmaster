const {
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    ChannelType, 
    OverwriteType,
    PermissionsBitField,
} = require('discord.js');
const { getCategoryIdForGroup, getLogChannelIdForGroup } = require('../config/ticketGuildConfig');
const { HR_ROLE_ID } = require('../utils/isAdminChannel');
const directLineStore = require('../utils/directLineStore');
const { buildTranscript, sendTranscript, formatStamp } = require('../utils/ticketTranscript');
const { reportError } = require('../utils/errorReporter');
const { encodeId } = require('../interactions/directLineId');

const CHANNEL_PREFIX = 'dc-';

const creating = new Set();

const MEMBER_PERMS = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
];

const STATUS_TEXT = {
    open: 'open',
    filing: 'being filed right now',
    filed: 'already filed',
};

function describeStatus(status) {
    return STATUS_TEXT[status] ?? status;
}

function confirmRow(dlId, action) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(encodeId(dlId, `${action}Yes`)).setLabel('Yes').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(encodeId(dlId, `${action}No`)).setLabel('No').setStyle(ButtonStyle.Secondary),
    );
}

function slugifyUsername(user) {
    return String(user.username || user.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || user.id;
}

function buildChannelName(primaryUser) {
    const base = `${CHANNEL_PREFIX}${slugifyUsername(primaryUser)}`.slice(0, 90);
    const uses = directLineStore.countChannelNameUses(base);
    if (uses === 0) return base;
    return `${base}-${uses + 1}`.slice(0, 100);
}

function isDirectLineChannel(channel) {
    return !!channel && typeof channel.name === 'string' && channel.name.startsWith(CHANNEL_PREFIX);
}

function getOpenDirectLineForChannel(channel) {
    if (!isDirectLineChannel(channel)) return null;
    const record = directLineStore.getDirectLineByChannelId(channel.id);
    if (!record || record.status !== 'open') return null;
    return record;
}

// ─── Create ─────────────────────────────────────────────────────────────────

async function createDirectLine(interaction, targets) {
    if (!HR_ROLE_ID) {
        return interaction.editReply({ content: '❌ `HR_ROLE_ID` is not configured in the environment. Set it up before using this command.' });
    }

    const categoryId = getCategoryIdForGroup('hr');
    if (!categoryId) {
        return interaction.editReply({ content: '❌ No HR ticket category configured. An admin needs to run `/ticket config` first.' });
    }

    const lockKey = targets.map(u => u.id).sort().join(',');
    if (creating.has(lockKey)) {
        return interaction.editReply({ content: '⏳ A direct line with these people is already being created — give it a moment.' });
    }
    creating.add(lockKey);

    let channel = null;
    let record = null;

    try {
        const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
        if (!category) {
            return await interaction.editReply({ content: '❌ The configured HR category no longer exists. An admin needs to run `/ticket config` again.' });
        }

        const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        const missing = me.permissions.missing([...MEMBER_PERMS, PermissionsBitField.Flags.ManageChannels]);
        if (missing.length) {
            return await interaction.editReply({ content: `❌ The bot is missing permissions it needs for this: ${missing.map(m => `\`${m}\``).join(', ')}. Nothing was created.` });
        }

        const [primary] = targets;
        const channelName = buildChannelName(primary);

        const permissionOverwrites = [
            { id: interaction.guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: HR_ROLE_ID, type: OverwriteType.Role, allow: MEMBER_PERMS },
            { id: me.id, type: OverwriteType.Member, allow: MEMBER_PERMS },
            ...targets.map(user => ({ id: user.id, type: OverwriteType.Member, allow: MEMBER_PERMS })),
        ];

        channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites,
        });

        const now = Date.now();
        record = await directLineStore.addDirectLine({
            channelId: channel.id,
            channelName,
            targetIds: targets.map(u => u.id),
            createdBy: interaction.user.id,
            createdAt: now,
            accessLog: [{ at: now, action: 'opened', by: interaction.user.id, userIds: targets.map(u => u.id) }],
        });

        const mentionList = targets.map(u => `<@${u.id}>`).join(', ');
        const embed = new EmbedBuilder()
            .setTitle('📞 Direct Line')
            .setDescription(
                'This is a direct line of communication that has been engaged by the HR team with ' +
                `${mentionList}. This channel is visible only to the HR team and the people listed above. ` +
                'Messages sent here will be stored for future reference.',
            )
            .setColor(0x5865f2)
            .setTimestamp();

        await channel.send({ content: `<@&${HR_ROLE_ID}> ${mentionList}`, embeds: [embed] });

        await interaction.editReply({ content: `✅ Direct line opened: ${channel}` })
            .catch(err => console.warn('[directLineFlow] Direct line opened but the confirmation reply failed:', err.message));
        return record;
    } catch (err) {
        const leftovers = [];
        if (record) {
            await directLineStore.removeDirectLine(record.id).catch(removeErr => {
                leftovers.push('direct line record');
                console.error('[directLineFlow] Rollback: could not remove the record:', removeErr);
            });
        }
        if (channel) {
            await channel.delete('Direct line creation failed — rolling back').catch(deleteErr => {
                leftovers.push(`channel <#${channel.id}>`);
                console.error('[directLineFlow] Rollback: could not delete the channel:', deleteErr);
            });
        }

        await reportError(interaction.client, {
            scope: '[DirectLine]',
            message: leftovers.length ? 'Direct line creation failed and the rollback was incomplete' : 'Direct line creation failed (rolled back cleanly)',
            error: err,
            context: {
                createdBy: `<@${interaction.user.id}>`,
                targets: targets.map(u => `<@${u.id}>`).join(', '),
                ...(leftovers.length ? { 'needs manual cleanup': leftovers.join(', ') } : {}),
            },
        });

        await interaction.editReply({
            content: leftovers.length
                ? '❌ Something went wrong opening the direct line. A leftover item may need removing by hand — details were posted to the log.'
                : '❌ Something went wrong opening the direct line. Nothing was created — please try again.',
        }).catch(() => {});
        return null;
    } finally {
        creating.delete(lockKey);
    }
}

// ─── Attach / Detach ────────────────────────────────────────────────────────

const UNKNOWN_OVERWRITE = 10009;

async function postAccessAudit(interaction, record, entry, failed) {
    const logChannelId = getLogChannelIdForGroup('hr');
    const logChannel = logChannelId
        ? interaction.guild.channels.cache.get(logChannelId) ?? await interaction.guild.channels.fetch(logChannelId).catch(() => null)
        : null;
    if (!logChannel) {
        console.warn('[directLineFlow] No HR log channel available for the access audit entry.');
        return false;
    }

    try {
        const removed = entry.action === 'removed';
        const embed = new EmbedBuilder()
            .setTitle(removed ? '🚪 Direct Line — people removed' : '➕ Direct Line — people added')
            .setColor(removed ? 0xed4245 : 0x57f287)
            .addFields(
                { name: 'Direct line', value: `<#${record.channelId}> (\`${record.channelName}\`)`, inline: false },
                { name: removed ? 'Removed' : 'Added', value: entry.userIds.map(id => `<@${id}>`).join(', '), inline: false },
                { name: 'By', value: `<@${entry.by}>`, inline: true },
                { name: 'When', value: `<t:${Math.floor(entry.at / 1000)}:f>`, inline: true },
            );
        if (failed.length) {
            embed.addFields({
                name: '⚠️ Could not change',
                value: failed.map(f => `<@${f.user.id}> — ${f.reason}`).join('\n').slice(0, 1024),
            });
        }
        await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        return true;
    } catch (err) {
        console.error('[directLineFlow] Failed to post the access audit entry:', err);
        return false;
    }
}

async function attachTargets(interaction, record, targets, remove) {
    const channel = interaction.guild.channels.cache.get(record.channelId)
        || await interaction.guild.channels.fetch(record.channelId).catch(() => null);

    if (!channel) {
        return interaction.editReply({ content: '❌ This direct line\'s channel no longer exists.' });
    }

    const currentIds = new Set(record.targetIds);
    const changed = [];
    const failed = [];

    for (const user of targets) {
        if (remove ? !currentIds.has(user.id) : currentIds.has(user.id)) continue;

        try {
            if (remove) {
                await channel.permissionOverwrites.delete(user.id);
            } else {
                await channel.permissionOverwrites.create(user.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                });
            }
            changed.push(user);
        } catch (err) {
            if (remove && err.code === UNKNOWN_OVERWRITE) {
                changed.push(user);   // they already had no access — the record just needs to catch up
            } else {
                console.warn(`[directLineFlow] Could not ${remove ? 'remove' : 'add'} ${user.id}:`, err.message);
                failed.push({ user, reason: err.message });
            }
        }
    }

    const verb = remove ? 'remove' : 'add';
    const failureLines = failed.length
        ? `\n${failed.map(f => `⚠️ Couldn\'t ${verb} <@${f.user.id}> — ${f.reason}`).join('\n')}`
        : '';

    if (!changed.length) {
        if (failed.length) {
            return interaction.editReply({ content: `❌ Nothing was changed.${failureLines}` });
        }
        return interaction.editReply({ content: remove ? 'ℹ️ None of those people were part of this direct line.' : 'ℹ️ Everyone listed already has access to this direct line.' });
    }

    const entry = { at: Date.now(), action: remove ? 'removed' : 'added', by: interaction.user.id, userIds: changed.map(u => u.id) };
    let updated;
    try {
        updated = await directLineStore.mutateDirectLine(record.id, current => {
            const ids = new Set(current.targetIds);
            for (const user of changed) {
                if (remove) ids.delete(user.id);
                else ids.add(user.id);
            }
            return { targetIds: [...ids], accessLog: [...(current.accessLog ?? []), entry] };
        });
    } catch (err) {
        await reportError(interaction.client, {
            scope: '[DirectLine]',
            message: 'Channel access was changed but the direct line record could not be updated',
            error: err,
            context: { directLine: record.id, channel: `<#${record.channelId}>`, people: changed.map(u => `<@${u.id}>`).join(', ') },
        });
        return interaction.editReply({ content: `⚠️ Access in the channel was changed, but I couldn't save it to the record — the record is now out of sync. Details were posted to the log.${failureLines}` });
    }

    const mentionList = changed.map(u => `<@${u.id}>`).join(', ');
    const when = `<t:${Math.floor(entry.at / 1000)}:f>`;
    const notice = remove
        ? `🚪 ${mentionList} ${changed.length > 1 ? 'have' : 'has'} been removed from this direct line by <@${interaction.user.id}> · ${when}`
        : `➕ ${mentionList} ${changed.length > 1 ? 'have' : 'has'} been added to this direct line by <@${interaction.user.id}> · ${when}`;
    const noticePosted = await channel.send({
        content: notice,
        allowedMentions: remove ? { parse: [] } : { users: changed.map(u => u.id) },   // removed people can't see the channel anymore
    }).then(() => true).catch(err => {
        console.warn('[directLineFlow] Could not post the access notice in the channel:', err.message);
        return false;
    });

    const audited = await postAccessAudit(interaction, record, entry, failed);

    const warnings = [];
    if (!noticePosted) warnings.push("I couldn't post the notice in the channel.");
    if (!audited) warnings.push("I couldn't post the audit entry to the HR log channel.");

    await interaction.editReply({
        content: `${remove ? '✅ Removed' : '✅ Added'}: ${mentionList}${failureLines}${warnings.map(w => `\n⚠️ ${w}`).join('')}`,
    });

    return updated;
}

// ─── File ───────────────────────────────────────────────────────────────────

async function promptFileConfirm(interaction, record) {
    await interaction.reply({
        content: '🗄️ File this direct line? This is **irreversible** — the transcript will be logged and the channel will be deleted. Attachments are reposted to the log where possible; anything too large or that can\'t be downloaded is listed as not preserved.',
        components: [confirmRow(record.id, 'file')],
        flags: 64,
    });
}

async function cancelFile(interaction) {
    await interaction.update({ content: 'Cancelled.', components: [] });
}

function describeAccessLog(record) {
    const lines = (record.accessLog ?? []).map(entry => {
        const people = entry.userIds.map(id => `<@${id}>`).join(', ');
        const what = entry.action === 'opened' ? `Opened with ${people}`
            : entry.action === 'added' ? `Added ${people}`
            : `Removed ${people}`;
        return `- ${formatStamp(entry.at)} — ${what} (by <@${entry.by}>)`;
    });
    return lines.length ? `\n${lines.join('\n')}` : null;
}

async function finalizeFile(interaction, record) {
    const logChannelId = getLogChannelIdForGroup('hr');
    const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
    const channel = interaction.guild.channels.cache.get(record.channelId);

    if (!logChannel) {
        return { ok: false, reason: 'config', message: '❌ No HR log channel configured. An admin needs to run `/ticket config` first. Filing aborted.' };
    }
    if (!channel) {
        return { ok: false, reason: 'channel', message: '❌ Direct line channel no longer exists.' };
    }

    const claimed = await directLineStore.transitionDirectLine(record.id, ['open'], { status: 'filing' });
    if (!claimed.ok) return claimed;

    const warnings = [];
    const filedAt = Date.now();

    try {
        let thread = record.logThreadId ? await logChannel.threads.fetch(record.logThreadId).catch(() => null) : null;
        const isRetry = Boolean(thread);
        if (!thread) {
            thread = await logChannel.threads.create({
                name: `${record.channelName}`.slice(0, 100),
                reason: `Direct line ${record.id} filed`,
            });
        }
        if (thread.id !== record.logThreadId) {
            await directLineStore.updateDirectLine(record.id, { logThreadId: thread.id });
        }
        if (isRetry) {
            await thread.send({ content: '-# ↻ An earlier filing attempt was interrupted — the transcript restarts below.', allowedMentions: { parse: [] } });
        }

        const meta = [
            ['Opened by', `<@${record.createdBy}> — ${formatStamp(record.createdAt)}`],
            ['People now in the channel', record.targetIds.map(id => `<@${id}>`).join(', ') || 'none'],
            ['Access history', describeAccessLog(record)],
            ['Filed by', `<@${interaction.user.id}> — ${formatStamp(filedAt)}`],
        ];

        const transcript = await buildTranscript(channel, {
            header: `📞 Direct Line — ${record.channelName}`,
            meta,
            preserveAttachments: true,
        });

        const sent = await sendTranscript(thread, transcript);
        if (sent.notPreserved.length) {
            warnings.push(`${sent.notPreserved.length} attachment(s) could not be preserved — they are listed at the end of the log.`);
        }
    } catch (err) {
        await directLineStore.updateDirectLine(record.id, { status: 'open' });
        await reportError(interaction.client, {
            scope: '[DirectLine]',
            message: `Filing direct line ${record.channelName} failed before the channel was deleted`,
            error: err,
            context: { directLine: record.id, filedBy: `<@${interaction.user.id}>` },
        });
        return { ok: false, reason: 'error', message: `❌ Filing failed: ${err.message}\nThe direct line is still open and its channel is untouched — you can try again.` };
    }

    const updated = await directLineStore.updateDirectLine(record.id, {
        status: 'filed',
        filedAt,
        filedBy: interaction.user.id,
    });

    try {
        await channel.delete(`Direct line ${record.id} filed`);
    } catch (err) {
        console.warn('[directLineFlow] Failed to delete filed direct line channel:', err.message);
        warnings.push(`The transcript is saved, but I couldn't delete <#${channel.id}> — please delete it manually (${err.message}).`);
    }

    return { ok: true, record: updated, warnings };
}

module.exports = {
    CHANNEL_PREFIX,
    isDirectLineChannel,
    getOpenDirectLineForChannel,
    createDirectLine,
    attachTargets,
    promptFileConfirm,
    cancelFile,
    finalizeFile,
    describeStatus,
};
