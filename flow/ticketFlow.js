const { randomUUID } = require('crypto');
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ChannelType,
} = require('discord.js');

const { getTicketType } = require('../config/ticketTypes');
const { getCategoryIdForGroup, getLogChannelIdForGroup } = require('../config/ticketGuildConfig');
const ticketStore = require('../utils/ticketStore');
const { buildTranscriptChunks } = require('../utils/ticketTranscript');
const { encodeId } = require('../interactions/ticketId');

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

// ─── Create ─────────────────────────────────────────────────────────────────

async function createTicket(interaction, typeKey, submissionData) {
    const type = getTicketType(typeKey);
    if (!type) {
        return interaction.editReply({ content: `❌ Unknown ticket type \`${typeKey}\`.` });
    }
    const categoryId = type.categoryId || getCategoryIdForGroup(type.categoryGroup);
    if (!categoryId) {
        return interaction.editReply({ content: `❌ No ticket category configured for this type (\`${type.categoryGroup || 'normal'}\`). An admin needs to run \`/ticket config\` first.` });
    }

    const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
    if (!category) {
        return interaction.editReply({ content: `❌ The configured ticket category no longer exists. An admin needs to run \`/ticket config\` again.` });
    }

    const number = await ticketStore.nextTicketNumber(type.slug);
    const rawUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const tag = type.channelTag || type.slug;
    const channelName = `${number}-${tag}-${rawUsername}`.slice(0, 100);

    const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
    });

    await channel.permissionOverwrites.create(interaction.user.id, {
        ViewChannel: true,
        SendMessages: true,
    });

    const ticketId = randomUUID();
    const record = {
        id: ticketId,
        ticketNumber: number,
        type: type.key,
        raiserId: interaction.user.id,
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
        submissionData,
        controlMessageId: null,
    };
    await ticketStore.addTicket(record);

    const embed = new EmbedBuilder()
        .setTitle(`${type.buttonEmoji} ${type.label} — #${number}`)
        .setDescription(submissionData.details || '*No additional details provided.*')
        .addFields(
            { name: 'Reason', value: submissionData.reason || '—' },
            { name: 'Name / Identification', value: submissionData.identification || '—' },
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

    await interaction.editReply({ content: `✅ Ticket created: ${channel}` });
}

// ─── Claim / Unclaim ────────────────────────────────────────────────────────

async function claimTicket(interaction, ticket) {
    const updated = await ticketStore.updateTicket(ticket.id, { claimerId: interaction.user.id });
    await refreshTicketMessage(interaction, updated);
    await interaction.reply({ content: claimLine(interaction.user.id) });
}

async function unclaimTicket(interaction, ticket) {
    const updated = await ticketStore.updateTicket(ticket.id, { claimerId: null });
    await refreshTicketMessage(interaction, updated);
    await interaction.reply({ content: claimLine(null) });
}

async function refreshTicketMessage(interaction, ticket) {
    if (!ticket.controlMessageId || !ticket.channelId) return;
    try {
        const channel = interaction.guild.channels.cache.get(ticket.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(ticket.controlMessageId);
        await msg.edit({ components: actionRow(ticket.id, ticket.status, ticket.claimerId) });
    } catch (err) {
        console.warn(`[ticketFlow] Could not refresh ticket message for ${ticket.id}:`, err.message);
    }
}

// ─── Close ──────────────────────────────────────────────────────────────────

async function promptCloseConfirm(interaction, ticket) {
    await interaction.reply({
        content: '⚠️ Close this ticket? The raiser will lose visibility.',
        components: [confirmRow(ticket.id, 'close')],
        flags: 64,
    });
}

async function cancelClose(interaction) {
    await interaction.update({ content: 'Cancelled.', components: [] });
}

async function promptCloseFeedbackModal(interaction, ticket) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const modal = new ModalBuilder()
        .setCustomId(encodeId(ticket.id, 'closeFeedbackModal'))
        .setTitle('Close Ticket')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('reason').setLabel('Reason for closing').setStyle(TextInputStyle.Short).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('feedback').setLabel('Additional feedback').setStyle(TextInputStyle.Paragraph).setRequired(false),
            ),
        );
    await interaction.showModal(modal);
}

async function finalizeClose(interaction, ticket, { reason, feedback } = {}) {
    const updated = await ticketStore.updateTicket(ticket.id, {
        status: 'closed',
        closedAt: Date.now(),
        closedBy: interaction.user.id,
        closeReason: reason || null,
        closeFeedback: feedback?.length ? feedback : null,
    });

    const channel = interaction.guild.channels.cache.get(ticket.channelId);
    if (channel) {
        await channel.permissionOverwrites.edit(ticket.raiserId, { ViewChannel: false }).catch(() => {});
        if (ticket.controlMessageId) {
            const msg = await channel.messages.fetch(ticket.controlMessageId).catch(() => null);
            if (msg) await msg.edit({ components: actionRow(ticket.id, 'closed', updated.claimerId) }).catch(() => {});
        }
        await channel.send(`🔒 Ticket closed by <@${interaction.user.id}>. Reason: ${reason || 'No feedback provided'}`);
        await channel.send('⚠️ Reminder: filing this ticket will **not** preserve images/attachments in the log — save anything important separately before filing.');
    }

    return updated;
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
    const updated = await ticketStore.updateTicket(ticket.id, { status: 'open', closedAt: null, closedBy: null, closeReason: null, closeFeedback: null });

    const channel = interaction.guild.channels.cache.get(ticket.channelId);
    if (channel) {
        await channel.permissionOverwrites.edit(ticket.raiserId, { ViewChannel: true, SendMessages: true }).catch(() => {});
        await channel.send({ content: `♻️ Ticket resurrected by <@${interaction.user.id}>.`, components: actionRow(ticket.id, 'open', updated.claimerId) });
    }

    return updated;
}

// ─── File ───────────────────────────────────────────────────────────────────

async function promptFileConfirm(interaction, ticket) {
    await interaction.reply({
        content: '🗄️ File this ticket? This is **irreversible** — the channel will be deleted after the transcript is logged. ⚠️ Images/attachments in this ticket will **not** be preserved in the log.',
        components: [confirmRow(ticket.id, 'file')],
        flags: 64,
    });
}

async function finalizeFile(interaction, ticket) {
    const type = getTicketType(ticket.type);
    const logChannelId = getLogChannelIdForGroup(type?.categoryGroup);
    const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
    const channel = interaction.guild.channels.cache.get(ticket.channelId);

    if (!logChannel) {
        await interaction.editReply({ content: `❌ No log channel configured for this ticket type (\`${type?.categoryGroup || 'normal'}\`). An admin needs to run \`/ticket config\` first. Filing aborted.` });
        return null;
    }
    if (!channel) {
        await interaction.editReply({ content: '❌ Ticket channel no longer exists.' });
        return null;
    }

    const header = `Ticket #${ticket.ticketNumber} — ${type?.label || ticket.type} — raised by <@${ticket.raiserId}>`;
    const chunks = await buildTranscriptChunks(channel, {
        header,
        closeReason: ticket.closeReason,
        closeFeedback: ticket.closeFeedback,
    });

    let thread = ticket.logThreadId ? await logChannel.threads.fetch(ticket.logThreadId).catch(() => null) : null;
    if (!thread) {
        const tag = type?.channelTag || type?.slug || ticket.type;
        thread = await logChannel.threads.create({
            name: `${ticket.ticketNumber}-${tag}-${ticket.raiserId}`.slice(0, 100),
            reason: `Ticket ${ticket.id} filed`,
        });
    }

    for (const chunk of chunks) {
        await thread.send(chunk);
    }

    const updated = await ticketStore.updateTicket(ticket.id, {
        status: 'filed',
        filedAt: Date.now(),
        channelId: null,
        logThreadId: thread.id,
    });

    await channel.delete().catch(err => console.warn(`[ticketFlow] Failed to delete filed ticket channel:`, err.message));

    return updated;
}

module.exports = {
    actionRow,
    claimLine,
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
