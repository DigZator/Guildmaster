const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { formatCurrency } = require('../utils/currency');

const PAGE_SIZE = 10;
const TIMEOUT_MS = 10 * 60 * 1000;
const timeouts = new Map();
const sessions = new Map();

function rarityEmoji(rarity) {
    return { Common: '⚪', Uncommon: '🟢', Rare: '🔵', 'Very Rare': '🟣', Legendary: '🟠' }[rarity] ?? '⚫';
}

function buildSearchEmbed(query, results, page, totalPages) {
    const start = page * PAGE_SIZE;
    const slice = results.slice(start, start + PAGE_SIZE);

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`🔎 Catalogue search: "${query}"`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages} · ${results.length} result(s)` })
        .setTimestamp();

    const rows = slice.map(item => {
        const code   = item.code.padEnd(5);
        const name   = item.name.padEnd(28).slice(0, 28);
        const rarity = (item.rarity ?? '—').padEnd(10);
        const price  = formatCurrency(item.price);
        return `${code} ${rarityEmoji(item.rarity)} ${name} ${rarity} ${price}`;
    });

    const header  = `${'Code'.padEnd(5)} ${'  '}${'Name'.padEnd(28)} ${'Rarity'.padEnd(10)} Price`;
    const divider = '─'.repeat(58);
    embed.setDescription(`\`\`\`\n${header}\n${divider}\n${rows.join('\n')}\n\`\`\`\nUse \`/league shop info <code>\` for details.`);
    return embed;
}

function buildRow(page, totalPages, messageId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`shopsearch_prev_${page}_${messageId}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`shopsearch_next_${page}_${messageId}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
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

async function sendResults(interaction, query, results) {
    const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
    const embed = buildSearchEmbed(query, results, 0, totalPages);

    const message = await interaction.editReply({
        embeds: [embed],
        components: totalPages > 1 ? [buildRow(0, totalPages, 'init')] : [],
        fetchReply: true,
    });

    if (totalPages > 1) {
        scheduleTimeout(message);
        sessions.set(message.id, { query, results, totalPages });
    }
}

async function paginate(interaction, delta) {
    await interaction.deferUpdate();
    const parts = interaction.customId.split('_'); // ['shopsearch','prev'|'next', page, messageId]
    const page = parseInt(parts[2]) + delta;
    const session = sessions.get(interaction.message.id);
    if (!session) return interaction.editReply({ content: '❌ Session expired.', components: [] });

    const { query, results, totalPages } = session;
    const message = await interaction.editReply({
        embeds: [buildSearchEmbed(query, results, page, totalPages)],
        components: [buildRow(page, totalPages, interaction.message.id)],
        fetchReply: true,
    });
    scheduleTimeout(message);
}

module.exports = {
    sendResults,
    prefix: {
        shopsearch_prev_: async (interaction) => paginate(interaction, -1),
        shopsearch_next_: async (interaction) => paginate(interaction, +1),
    },
};
