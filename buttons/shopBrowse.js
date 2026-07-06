const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildShopEmbed, buildMarketEmbed } = require('../commands/leagueShop');

const TIMEOUT_MS = 10 * 60 * 1000;
const timeouts = new Map();
const sessions = new Map();

function buildRow(kind, page, totalPages, messageId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${kind}_prev_${page}_${messageId}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`${kind}_next_${page}_${messageId}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    );
}

function scheduleTimeout(message) {
    if (timeouts.has(message.id)) clearTimeout(timeouts.get(message.id));
    const handle = setTimeout(async () => {
        timeouts.delete(message.id);
        try { await message.edit({ components: [] }); } catch {}
    }, TIMEOUT_MS);
    timeouts.set(message.id, handle);
}

async function sendPaged(interaction, kind, items, filters) {
    const buildEmbed = kind === 'shopbrowse' ? buildShopEmbed : buildMarketEmbed;
    const totalPages = Math.max(1, Math.ceil(items.length / 12));
    const embed = buildEmbed(items, 0, totalPages, filters);

    const message = await interaction.editReply({
        embeds: [embed],
        components: totalPages > 1 ? [buildRow(kind, 0, totalPages, 'init')] : [],
        fetchReply: true,
    });

    if (totalPages > 1) {
        scheduleTimeout(message);
        sessions.set(message.id, { kind, items, filters, totalPages });
    }
}

async function paginate(interaction, delta) {
    await interaction.deferUpdate();
    const parts = interaction.customId.split('_'); // [kind, 'prev'|'next', page, messageId]
    const kind = parts[0];
    const page = parseInt(parts[2]) + delta;
    const session = sessions.get(interaction.message.id);
    if (!session) return interaction.editReply({ content: '❌ Session expired.', components: [] });

    const { items, filters, totalPages } = session;
    const buildEmbed = kind === 'shopbrowse' ? buildShopEmbed : buildMarketEmbed;
    const message = await interaction.editReply({
        embeds: [buildEmbed(items, page, totalPages, filters)],
        components: [buildRow(kind, page, totalPages, interaction.message.id)],
        fetchReply: true,
    });
    scheduleTimeout(message);
}

module.exports = {
    sendPaged,
    prefix: {
        shopbrowse_prev_: (i) => paginate(i, -1),
        shopbrowse_next_: (i) => paginate(i, +1),
        marketbrowse_prev_: (i) => paginate(i, -1),
        marketbrowse_next_: (i) => paginate(i, +1),
    },
};
