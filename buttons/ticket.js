const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { getTicketType } = require('../config/ticketTypes');
const { isAdminChannel } = require('../utils/isAdminChannel');
const ticketStore = require('../utils/ticketStore');
const ticketFlow = require('../flow/ticketFlow');
const { decodeId } = require('../interactions/ticketId');

function isTicketStaff(interaction, ticket) {
    if (isAdminChannel(interaction, 'botAdmin')) return true;
    const type = getTicketType(ticket.type);
    if (!type?.viewerRoleId) return false;
    return interaction.member?.roles?.cache?.has(type.viewerRoleId) ?? false;
}

function isTicketRaiser(interaction, ticket) {
    return interaction.user.id === ticket.raiserId;
}

const STAFF_ONLY_ACTIONS = new Set(['claim', 'unclaim', 'resurrect', 'resurrectYes', 'resurrectNo', 'file', 'fileYes', 'fileNo']);
const RAISER_OR_STAFF_ACTIONS = new Set(['close', 'closeYes', 'closeNo']);

function denyMessage() {
    return { content: '❌ You don\'t have permission to do that on this ticket.', flags: 64 };
}

// ─── Dashboard type-select buttons (customId: `ticketCreate:<typeKey>`) ─────

function ticketCreateCustomId(typeKey) {
    return `ticketCreate:${typeKey}`;
}

async function handleTicketCreateButton(interaction) {
    const typeKey = interaction.customId.split(':')[1];
    const type = getTicketType(typeKey);
    if (!type) {
        return interaction.reply({ content: '❌ Unknown ticket type.', flags: 64 });
    }

    const modalTitle = type.modalTitle || type.label;
    const modal = new ModalBuilder()
        .setCustomId(`ticketCreateModal:${typeKey}`)
        .setTitle(modalTitle.slice(0, 45))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('reason').setLabel('Reason for raising the ticket').setStyle(TextInputStyle.Short).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('identification').setLabel('Name (and Game Name if relevant)').setStyle(TextInputStyle.Short).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('details').setLabel("What do you need? Extra info?").setStyle(TextInputStyle.Paragraph).setRequired(false),
            ),
        );

    await interaction.showModal(modal);
}

// ─── Ticket action buttons (customId: `ticket:<ticketId>:<action>`) ─────────

function resolveTicket(interaction) {
    const { ticketId } = decodeId(interaction.customId);
    const ticket = ticketStore.getTicketById(ticketId);
    if (!ticket) return null;
    return ticket;
}

async function handleTicketButton(interaction) {
    const { action } = decodeId(interaction.customId);
    const ticket = resolveTicket(interaction);

    if (!ticket) {
        return interaction.reply({ content: '❌ This ticket record no longer exists.', flags: 64 });
    }

    if (STAFF_ONLY_ACTIONS.has(action) && !isTicketStaff(interaction, ticket)) {
        return interaction.reply(denyMessage());
    }
    if (RAISER_OR_STAFF_ACTIONS.has(action) && !isTicketStaff(interaction, ticket) && !isTicketRaiser(interaction, ticket)) {
        return interaction.reply(denyMessage());
    }

    switch (action) {
        case 'claim':
            return ticketFlow.claimTicket(interaction, ticket);
        case 'unclaim':
            return ticketFlow.unclaimTicket(interaction, ticket);
        case 'close':
            return ticketFlow.promptCloseConfirm(interaction, ticket);
        case 'closeYes':
            return ticketFlow.promptCloseFeedbackModal(interaction, ticket);
        case 'closeNo':
            return ticketFlow.cancelClose(interaction);
        case 'resurrect':
            return ticketFlow.promptResurrectConfirm(interaction, ticket);
        case 'resurrectYes':
            await interaction.deferUpdate();
            await ticketFlow.finalizeResurrect(interaction, ticket);
            return interaction.editReply({ content: '✅ Ticket resurrected.', components: [] });
        case 'resurrectNo':
            return interaction.update({ content: 'Cancelled.', components: [] });
        case 'file':
            return ticketFlow.promptFileConfirm(interaction, ticket);
        case 'fileYes': {
            await interaction.deferUpdate();
            const result = await ticketFlow.finalizeFile(interaction, ticket);
            if (result) await interaction.editReply({ content: '✅ Ticket filed and channel removed.', components: [] });
            return;
        }
        case 'fileNo':
            return interaction.update({ content: 'Cancelled.', components: [] });
        default:
            return interaction.reply({ content: '❌ This ticket control isn\'t wired up yet.', flags: 64 });
    }
}

// ─── Modal routing (called from modalHandler.js) ────────────────────────────

async function handleTicketModal(interaction) {
    if (interaction.customId.startsWith('ticketCreateModal:')) {
        const typeKey = interaction.customId.split(':')[1];
        await interaction.deferReply({ flags: 64 });
        const submissionData = {
            reason: interaction.fields.getTextInputValue('reason'),
            identification: interaction.fields.getTextInputValue('identification'),
            details: interaction.fields.getTextInputValue('details') || '',
        };
        return ticketFlow.createTicket(interaction, typeKey, submissionData);
    }

    if (interaction.customId.startsWith('ticket:')) {
        const { ticketId, action } = decodeId(interaction.customId);
        if (action === 'closeFeedbackModal') {
            const ticket = ticketStore.getTicketById(ticketId);
            if (!ticket) return interaction.reply({ content: '❌ This ticket record no longer exists.', flags: 64 });
            if (!isTicketStaff(interaction, ticket) && !isTicketRaiser(interaction, ticket)) {
                return interaction.reply(denyMessage());
            }

            const reason = interaction.fields.getTextInputValue('reason');
            const feedback = interaction.fields.getTextInputValue('feedback') || '';
            await interaction.deferReply({ flags: 64 });
            await ticketFlow.finalizeClose(interaction, ticket, { reason, feedback });
            return interaction.editReply({ content: '🔒 Ticket closed.' });
        }
    }

    return false;
}

module.exports = {
    prefix: {
        'ticketCreate:': handleTicketCreateButton,
        'ticket:': handleTicketButton,
    },
    ticketCreateCustomId,
    handleTicketModal,
};
