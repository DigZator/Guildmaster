const { getTicketType } = require('../config/ticketTypes');
const { isAdminChannel } = require('./isAdminChannel');

function isTicketStaff(interaction, ticket) {
    if (isAdminChannel(interaction, 'botAdmin')) return true;
    const type = getTicketType(ticket.type);
    if (!type?.viewerRoleId) return false;
    return interaction.member?.roles?.cache?.has(type.viewerRoleId) ?? false;
}

function isTicketRaiser(interaction, ticket) {
    return interaction.user.id === ticket.raiserId;
}

const CLOSED_BY_PATTERN = /closed by <@!?(\d+)>/i;

async function resolveCloserId(interaction, ticket) {
    if (ticket.closedBy) return ticket.closedBy;
    if (!ticket.closeControlMessageId || !ticket.channelId) return null;

    try {
        const guild = interaction.guild;
        const channel = guild.channels.cache.get(ticket.channelId) ?? await guild.channels.fetch(ticket.channelId);
        const message = await channel.messages.fetch(ticket.closeControlMessageId);
        return message.content?.match(CLOSED_BY_PATTERN)?.[1] ?? null;
    } catch (err) {
        console.warn(`[ticketPermissions] Could not read the close message for ${ticket.id}:`, err.message);
        return null;
    }
}

async function isTicketCloser(interaction, ticket) {
    const closerId = await resolveCloserId(interaction, ticket);
    return Boolean(closerId) && interaction.user.id === closerId;
}

function fileDenyMessage() {
    return { content: '❌ User filing a ticket cannot be the same as the user who closed it.', flags: 64 };
}

function denyMessage() {
    return { content: '❌ You don\'t have permission to do that on this ticket.', flags: 64 };
}

module.exports = { isTicketStaff, isTicketRaiser, isTicketCloser, resolveCloserId, fileDenyMessage, denyMessage };
