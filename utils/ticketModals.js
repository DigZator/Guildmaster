const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { encodeId } = require('../interactions/ticketId');

function input({ id, label, style, required, maxLength, value }) {
    const field = new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
        .setRequired(required);
    if (maxLength) field.setMaxLength(maxLength);
    if (value) field.setValue(String(value).slice(0, maxLength || 4000));
    return new ActionRowBuilder().addComponents(field);
}

function buildCreateModal(type, prefill = {}) {
    const modalTitle = type.modalTitle || type.label;
    return new ModalBuilder()
        .setCustomId(`ticketCreateModal:${type.key}`)
        .setTitle(modalTitle.slice(0, 45))
        .addComponents(
            input({ id: 'reason', label: 'Reason for raising the ticket', style: TextInputStyle.Short, required: true, maxLength: 1000, value: prefill.reason }),
            input({ id: 'identification', label: 'Name (and Game Name if relevant)', style: TextInputStyle.Short, required: true, maxLength: 1000, value: prefill.identification }),
            input({ id: 'details', label: 'What do you need? Extra info?', style: TextInputStyle.Paragraph, required: false, maxLength: 4000, value: prefill.details }),
        );
}

function buildCloseModal(ticketId, prefill = {}) {
    return new ModalBuilder()
        .setCustomId(encodeId(ticketId, 'closeFeedbackModal'))
        .setTitle('Close Ticket')
        .addComponents(
            input({ id: 'reason', label: 'Reason for closing', style: TextInputStyle.Short, required: true, maxLength: 1000, value: prefill.reason }),
            input({ id: 'feedback', label: 'Additional feedback', style: TextInputStyle.Paragraph, required: false, maxLength: 4000, value: prefill.feedback }),
        );
}

module.exports = { buildCreateModal, buildCloseModal };
