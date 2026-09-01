const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { THE_LONG_REST_CHANNEL_ID } = require('../data/channels');

const TLR_MOD_ROLE_IDS = [process.env.ADMINS_ROLE_ID, process.env.CLERK_OF_MORTAL_AFFAIRS_ROLE_ID].filter(Boolean);

async function buildRemoveConfirmation(interaction, messageId) {
    if (!/^\d{17,19}$/.test(messageId)) {
        return { ok: false, payload: { content: '❌ Invalid message ID format.' } };
    }

    const outputChannel = interaction.guild.channels.cache.get(THE_LONG_REST_CHANNEL_ID);

    if (!outputChannel) {
        return { ok: false, payload: { content: 'Output channel not found. Contact an admin.' } };
    }

    let message;
    try {
        message = await outputChannel.messages.fetch(messageId);
        if (!message.embeds || message.embeds.length === 0) {
            return { ok: false, payload: { content: 'The specified message is not a memorial.' } };
        }
    } catch (fetchError) {
        console.error('Error fetching message:', fetchError);
        return { ok: false, payload: { content: 'Could not find a message with that ID in the output channel.' } };
    }

    const member = interaction.member;

    const footerText = message.embeds[0]?.footer?.text || '';
    const authorIdMatch = footerText.match(/AuthorID:\s*(\d{17,19})/);
    const authorId = authorIdMatch ? authorIdMatch[1] : null;

    const isAuthor = authorId === interaction.user.id;
    const isAdmin = TLR_MOD_ROLE_IDS.length > 0 && member.roles.cache.some(r => TLR_MOD_ROLE_IDS.includes(r.id));

    if (!isAuthor && !isAdmin) {
        return { ok: false, payload: { content: 'You do not have permission to remove this memorial.' } };
    }

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${messageId}`)
            .setLabel('Confirm Delete')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${messageId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    const characterName = message.embeds[0]?.title || 'Unknown Character';
    const timestamp = message.createdAt.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    return {
        ok: true,
        payload: {
            content: `⚠️ **Confirm Deletion**\n\n` +
                `**Character:** ${characterName}\n` +
                `**Posted on:** ${timestamp}\n\n` +
                `This action cannot be undone.`,
            components: [confirmRow],
        },
    };
}

module.exports = { buildRemoveConfirmation };
