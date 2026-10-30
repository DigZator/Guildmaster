const { randomUUID } = require('crypto');
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ChannelType, MessageType,
} = require('discord.js');

const { getTicketType } = require('../config/ticketTypes');
const { getCategoryIdForGroup, getLogChannelIdForGroup } = require('../config/ticketGuildConfig');
const ticketStore = require('../utils/ticketStore');
const { buildTranscript, sendTranscript, formatStamp } = require('../utils/ticketTranscript');
const { reportError } = require('../utils/errorReporter');
const { encodeId } = require('../interactions/ticketId');
const { buildCloseModal } = require('../utils/ticketModals');
const { mention } = require('../utils/ticketCommands');
const { isTicketCloser, fileDenyMessage } = require('../utils/ticketPermissions');

const creating = new Set();

function actionRow(ticketId, status, claimerId) {
    const buttons = [];

    if (status === 'open') {
        buttons.push(
            new ButtonBuilder().setCustomId(encodeId(ticketId, 'claim')).setLabel(claimerId ? 'Reclaim' : 'Claim').setStyle(ButtonStyle.Primary).setEmoji('🔧'),
        );
        if (claimerId) {
            buttons.push(new ButtonBuilder().setCustomId(encodeId(ticketId, 'unclaim')).setLabel('Unclaim').setStyle(ButtonStyle.Secondary));
        }
        buttons.push(new ButtonBuilder().setCustomId(encodeId(ticketId, 'close')).setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'));
    } else if (status === 'closed') {
        buttons.push(new ButtonBuilder().setCustomId(encodeId(ticketId, 'resurrect')).setLabel('Resurrect').setStyle(ButtonStyle.Success).setEmoji('♻️'));
        buttons.push(new ButtonBuilder().setCustomId(encodeId(ticketId, 'file')).setLabel('File').setStyle(ButtonStyle.Danger).setEmoji('🗄️'));
    }

    return buttons.length ? [new ActionRowBuilder().addComponents(...buttons)] : [];
}

function claimLine(claimerId) {
    return claimerId ? `🔧 *<@${claimerId}>* is now handling this ticket.` : '🔧 This ticket is currently **unclaimed**.';
}

function confirmRow(ticketId, action) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(encodeId(ticketId, `${action}Yes`)).setLabel('Yes').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(encodeId(ticketId, `${action}No`)).setLabel('No').setStyle(ButtonStyle.Secondary),
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_TEXT = {
    open: 'open',
    closed: 'closed',
    filing: 'being filed right now',
    filed: 'already filed',
};

function describeStatus(status) {
    return STATUS_TEXT[status] ?? status;
}

function slugifyName(name) {
    return String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function resolveRaiserName(client, ticket) {
    if (ticket.raiserName) return ticket.raiserName;
    const user = await client.users.fetch(ticket.raiserId).catch(() => null);
    return user?.username ?? null;
}

async function syncControlMessage(guild, ticket) {
    if (!ticket.controlMessageId || !ticket.channelId) return false;
    try {
        const channel = guild.channels.cache.get(ticket.channelId) ?? await guild.channels.fetch(ticket.channelId);
        if (!channel) return false;
        const msg = await channel.messages.fetch(ticket.controlMessageId);
        await msg.edit({ components: actionRow(ticket.id, ticket.status, ticket.claimerId) });
        return true;
    } catch (err) {
        console.warn(`[ticketFlow] Could not refresh ticket message for ${ticket.id}:`, err.message);
        return false;
    }
}

function formatWarnings(warnings = []) {
    return warnings.length ? `\n${warnings.map(w => `⚠️ ${w}`).join('\n')}` : '';
}

async function pinControlMessage(channel, message) {
    try {
        await message.pin();
    } catch (err) {
        console.warn(`[ticketFlow] Could not pin the control message in ${channel.id}:`, err.message);
        return false;
    }
    try {
        const recent = await channel.messages.fetch({ limit: 5 });
        await recent.find(m => m.type === MessageType.ChannelPinnedMessage)?.delete();
    } catch { /* cosmetic only */ }
    return true;
}

// ─── Create ─────────────────────────────────────────────────────────────────
async function createTicket(interaction, typeKey, submissionData) {
    const type = getTicketType(typeKey);
    if (!type) {
        return interaction.editReply({ content: `❌ Unknown ticket type \`${typeKey}\`.` });
    }

    const lockKey = `${interaction.user.id}:${type.key}`;
    if (creating.has(lockKey)) {
        return interaction.editReply({ content: '⏳ Your ticket is already being created — give it a moment.' });
    }
    creating.add(lockKey);

    let channel = null;
    let record = null;

    try {
        const categoryId = type.categoryId || getCategoryIdForGroup(type.categoryGroup);
        if (!categoryId) {
            return await interaction.editReply({ content: `❌ No ticket category configured for this type (\`${type.categoryGroup || 'normal'}\`). An admin needs to run \`/ticket config\` first.` });
        }

        const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
        if (!category) {
            return await interaction.editReply({ content: `❌ The configured ticket category no longer exists. An admin needs to run \`/ticket config\` again.` });
        }

        const number = await ticketStore.nextTicketNumber(type.slug);
        const rawUsername = slugifyName(interaction.user.username);
        const tag = type.channelTag || type.slug;
        const channelName = `${tag}-${number}-${rawUsername}`.slice(0, 100);

        channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryId,
        });

        try {
            await channel.permissionOverwrites.edit(interaction.user.id, {
                ViewChannel: true,
                SendMessages: true,
                UseApplicationCommands: true,
            });
        } catch (err) {
            const mine = channel.permissionsFor(interaction.guild.members.me);
            console.error(
                `[ticketFlow] Could not grant raiser access on ${channel.id}. ` +
                `Bot perms in new channel: ${mine ? mine.toArray().join(', ') : 'unresolvable'}`,
            );
            throw err;
        }

        const ticketId = randomUUID();
        record = {
            id: ticketId,
            ticketNumber: number,
            type: type.key,
            raiserId: interaction.user.id,
            raiserName: interaction.user.username,
            channelId: channel.id,
            logThreadId: null,
            claimerId: null,
            status: 'open',
            createdAt: Date.now(),
            closedAt: null,
            filedAt: null,
            closeReason: null,
            closeFeedback: null,
            closedBy: null,
            filedBy: null,
            submissionData,
            controlMessageId: null,
            closeControlMessageId: null,
        };
        await ticketStore.addTicket(record);

        const embed = new EmbedBuilder()
            .setTitle(`${type.buttonEmoji} ${type.label} — #${number}`)
            .setDescription(submissionData.details || '*No additional details provided.*')
            .addFields(
                { name: 'Reason', value: submissionData.reason || '—' },
                { name: 'Name / Identification', value: submissionData.identification || '—' },
                { name: '💡 Quick commands', value: `Use ${mention('close')} anywhere in this channel to close this ticket — no need to scroll up for the buttons.` },
            )
            .setFooter({ text: claimLine(null).replace('🔧 ', '') })
            .setColor(0x5865f2)
            .setTimestamp();

        const pingTarget = type.pingTargetId ? `<@&${type.pingTargetId}>` : '';
        const controlMessage = await channel.send({
            content: `<@${interaction.user.id}> ${pingTarget}`.trim(),
            embeds: [embed],
            components: actionRow(ticketId, 'open', null),
        });

        await ticketStore.updateTicket(ticketId, { controlMessageId: controlMessage.id });
        await pinControlMessage(channel, controlMessage);

        await interaction.editReply({ content: `✅ Ticket created: ${channel}` })
            .catch(err => console.warn('[ticketFlow] Ticket created but the confirmation reply failed:', err.message));
        return;
    } catch (err) {
        const leftovers = [];
        if (record) {
            await ticketStore.removeTicket(record.id).catch(removeErr => {
                leftovers.push('ticket record');
                console.error('[ticketFlow] Rollback: could not remove ticket record:', removeErr);
            });
        }
        if (channel) {
            await channel.delete('Ticket creation failed — rolling back').catch(deleteErr => {
                leftovers.push(`channel <#${channel.id}>`);
                console.error('[ticketFlow] Rollback: could not delete channel:', deleteErr);
            });
        }

        await reportError(interaction.client, {
            scope: '[Tickets]',
            message: leftovers.length ? 'Ticket creation failed and the rollback was incomplete' : 'Ticket creation failed (rolled back cleanly)',
            error: err,
            context: {
                raiser: `<@${interaction.user.id}>`,
                type: type.key,
                ...(leftovers.length ? { 'needs manual cleanup': leftovers.join(', ') } : {}),
            },
        });

        return interaction.editReply({
            content: leftovers.length
                ? '❌ Something went wrong creating your ticket. Please contact a staff member — a leftover channel may need removing.'
                : '❌ Something went wrong creating your ticket. Nothing was created — please try again.',
        }).catch(() => {});
    } finally {
        creating.delete(lockKey);
    }
}

// ─── Claim / Unclaim ────────────────────────────────────────────────────────
async function claimTicket(interaction, ticket) {
    const result = await ticketStore.transitionTicket(ticket.id, ['open'], { claimerId: interaction.user.id });
    if (!result.ok) return result;
    await syncControlMessage(interaction.guild, result.ticket);
    await interaction.reply({ content: claimLine(interaction.user.id) });
    return result;
}

async function unclaimTicket(interaction, ticket) {
    const result = await ticketStore.transitionTicket(ticket.id, ['open'], { claimerId: null });
    if (!result.ok) return result;
    await syncControlMessage(interaction.guild, result.ticket);
    await interaction.reply({ content: claimLine(null) });
    return result;
}

// ─── Close ──────────────────────────────────────────────────────────────────
async function promptCloseConfirm(interaction, ticket) {
    await interaction.reply({
        content: `⚠️ Close this ticket? The raiser will lose visibility.\n-# 💡 You can also use ${mention('close')} to close tickets.`,
        components: [confirmRow(ticket.id, 'close')],
        flags: 64,
    });
}

async function cancelClose(interaction) {
    await interaction.update({ content: 'Cancelled.', components: [] });
}

async function promptCloseFeedbackModal(interaction, ticket, prefill = {}) {
    await interaction.showModal(buildCloseModal(ticket.id, prefill));
}

async function finalizeClose(interaction, ticket, { reason, feedback } = {}) {
    const result = await ticketStore.transitionTicket(ticket.id, ['open'], {
        status: 'closed',
        closedAt: Date.now(),
        closedBy: interaction.user.id,
        closeReason: reason || null,
        closeFeedback: feedback?.length ? feedback : null,
    });
    if (!result.ok) return result;

    const updated = result.ticket;
    const warnings = [];

    const channel = interaction.guild.channels.cache.get(ticket.channelId);
    if (!channel) {
        warnings.push('The ticket channel could not be found.');
        return { ok: true, ticket: updated, warnings };
    }

    try {
        await channel.permissionOverwrites.edit(ticket.raiserId, { ViewChannel: false });
    } catch (err) {
        console.warn(`[ticketFlow] Could not hide closed ticket ${ticket.id} from the raiser:`, err.message);
        warnings.push(`I couldn't remove the raiser's access — they may still see the channel (${err.message}).`);
    }

    if (!(await syncControlMessage(interaction.guild, updated))) {
        warnings.push("I couldn't update the ticket's buttons.");
    }

    try {
        const reasonText = (reason || 'No reason given').slice(0, 1000);
        const closeMessage = await channel.send({
            content: `🔒 Ticket closed by <@${interaction.user.id}>. Reason: ${reasonText}\n` +
                'ℹ️ Filing this ticket saves a transcript (including the request details) and reposts attachments to the log. Anything too large or that can\'t be downloaded is listed as not preserved — save anything important separately before filing.',
            components: actionRow(ticket.id, 'closed', null),
            allowedMentions: { parse: [] },
        });
        await ticketStore.updateTicket(ticket.id, { closeControlMessageId: closeMessage.id });
    } catch (err) {
        console.warn(`[ticketFlow] Could not post the close notice for ${ticket.id}:`, err.message);
        warnings.push("I couldn't post the close notice in the channel.");
    }

    return { ok: true, ticket: updated, warnings };
}

// ─── Resurrect ──────────────────────────────────────────────────────────────
async function promptResurrectConfirm(interaction, ticket) {
    await interaction.reply({
        content: '♻️ Resurrect this ticket? The raiser will regain visibility.',
        components: [confirmRow(ticket.id, 'resurrect')],
        flags: 64,
    });
}

async function finalizeResurrect(interaction, ticket) {
    const result = await ticketStore.transitionTicket(ticket.id, ['closed'], {
        status: 'open', closedAt: null, closedBy: null, closeReason: null, closeFeedback: null, closeControlMessageId: null,
    });
    if (!result.ok) return result;

    const updated = result.ticket;
    const warnings = [];

    const channel = interaction.guild.channels.cache.get(ticket.channelId);
    if (!channel) {
        warnings.push('The ticket channel could not be found.');
        return { ok: true, ticket: updated, warnings };
    }

    try {
        await channel.permissionOverwrites.edit(ticket.raiserId, { ViewChannel: true, SendMessages: true, UseApplicationCommands: true });
    } catch (err) {
        console.warn(`[ticketFlow] Could not restore raiser access for ${ticket.id}:`, err.message);
        warnings.push(`I couldn't restore the raiser's access (${err.message}).`);
    }

    if (!(await syncControlMessage(interaction.guild, updated))) {
        warnings.push("I couldn't update the ticket's buttons.");
    }

    if (ticket.closeControlMessageId) {
        await channel.messages.delete(ticket.closeControlMessageId)
            .catch(err => console.warn(`[ticketFlow] Could not remove the close-controls message for ${ticket.id}:`, err.message));
    }

    await channel.send({
        content: `♻️ Ticket resurrected by <@${interaction.user.id}>.`,
        allowedMentions: { parse: [] },
    }).catch(err => console.warn(`[ticketFlow] Could not post the resurrect notice for ${ticket.id}:`, err.message));

    return { ok: true, ticket: updated, warnings };
}

// ─── File ───────────────────────────────────────────────────────────────────
async function promptFileConfirm(interaction, ticket) {
    await interaction.reply({
        content: '🗄️ File this ticket? This is **irreversible** — the channel will be deleted once the transcript is logged. The transcript includes the request details, and attachments are reposted to the log where possible (anything too large or that can\'t be downloaded is listed as not preserved).',
        components: [confirmRow(ticket.id, 'file')],
        flags: 64,
    });
}

async function finalizeFile(interaction, ticket) {
    if (await isTicketCloser(interaction, ticket)) {
        return { ok: false, reason: 'closer', message: fileDenyMessage().content };
    }

    const type = getTicketType(ticket.type);
    const logChannelId = getLogChannelIdForGroup(type?.categoryGroup);
    const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
    const channel = interaction.guild.channels.cache.get(ticket.channelId);

    if (!logChannel) {
        return { ok: false, reason: 'config', message: `❌ No log channel configured for this ticket type (\`${type?.categoryGroup || 'normal'}\`). An admin needs to run \`/ticket config\` first. Filing aborted.` };
    }
    if (!channel) {
        return { ok: false, reason: 'channel', message: '❌ Ticket channel no longer exists.' };
    }

    const claimed = await ticketStore.transitionTicket(ticket.id, ['closed'], { status: 'filing' });
    if (!claimed.ok) return claimed;

    const warnings = [];
    const filedAt = Date.now();

    try {
        const raiserName = await resolveRaiserName(interaction.client, ticket);
        const tag = type?.channelTag || type?.slug || ticket.type;

        let thread = ticket.logThreadId ? await logChannel.threads.fetch(ticket.logThreadId).catch(() => null) : null;
        const isRetry = Boolean(thread);
        if (!thread) {
            thread = await logChannel.threads.create({
                name: `${tag}-${ticket.ticketNumber}-${slugifyName(raiserName) || ticket.raiserId}`.slice(0, 100),
                reason: `Ticket ${ticket.id} filed`,
            });
        }
        if (thread.id !== ticket.logThreadId) {
            await ticketStore.updateTicket(ticket.id, { logThreadId: thread.id });
        }
        if (isRetry) {
            await thread.send({ content: '-# ↻ An earlier filing attempt was interrupted — the transcript restarts below.', allowedMentions: { parse: [] } });
        }

        const meta = [
            ['Raised by', `<@${ticket.raiserId}>${raiserName ? ` (${raiserName})` : ''}`],
            ['Opened', formatStamp(ticket.createdAt)],
            ticket.closedAt ? ['Closed', `${formatStamp(ticket.closedAt)}${ticket.closedBy ? ` by <@${ticket.closedBy}>` : ''}`] : null,
            ['Close reason', ticket.closeReason || 'No reason given'],
            ['Close feedback', ticket.closeFeedback?.length ? ticket.closeFeedback : 'No feedback provided'],
            ['Filed by', `<@${interaction.user.id}> — ${formatStamp(filedAt)}`],
        ].filter(Boolean);

        const transcript = await buildTranscript(channel, {
            header: `🎫 Ticket #${ticket.ticketNumber} — ${type?.label || ticket.type}`,
            meta,
            preserveAttachments: true,
        });

        const sent = await sendTranscript(thread, transcript);
        if (sent.notPreserved.length) {
            warnings.push(`${sent.notPreserved.length} attachment(s) could not be preserved — they are listed at the end of the log.`);
        }
    } catch (err) {
        await ticketStore.updateTicket(ticket.id, { status: 'closed' });
        await reportError(interaction.client, {
            scope: '[Tickets]',
            message: `Filing ticket #${ticket.ticketNumber} failed before the channel was deleted`,
            error: err,
            context: { ticket: ticket.id, filedBy: `<@${interaction.user.id}>` },
        });
        return { ok: false, reason: 'error', message: `❌ Filing failed: ${err.message}\nThe ticket is still closed and its channel is untouched — you can try again.` };
    }

    const updated = await ticketStore.updateTicket(ticket.id, {
        status: 'filed',
        filedAt,
        filedBy: interaction.user.id,
    });

    try {
        await channel.delete(`Ticket ${ticket.id} filed`);
        await ticketStore.updateTicket(ticket.id, { channelId: null });
    } catch (err) {
        console.warn('[ticketFlow] Failed to delete filed ticket channel:', err.message);
        warnings.push(`The transcript is saved, but I couldn't delete <#${channel.id}> — please delete it manually (${err.message}).`);
    }

    return { ok: true, ticket: updated, warnings };
}

module.exports = {
    actionRow,
    claimLine,
    describeStatus,
    formatWarnings,
    syncControlMessage,
    createTicket,
    claimTicket,
    unclaimTicket,
    promptCloseConfirm,
    cancelClose,
    promptCloseFeedbackModal,
    finalizeClose,
    promptResurrectConfirm,
    finalizeResurrect,
    promptFileConfirm,
    finalizeFile,
};
