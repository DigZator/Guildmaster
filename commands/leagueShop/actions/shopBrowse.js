const { EmbedBuilder } = require('discord.js');
const { searchCatalogue, getCatalogueItemByCode } = require('../../../utils/5etoolsCatalogue');
const { getShopEntry, getBuyableEntry, getAllStockedEntries } = require('../../../utils/shopFloor');
const { formatCurrency } = require('../../../utils/currency');
const { rarityEmoji } = require('../embeds');

// ─── /league shop browse ──────────────────────────────────────────────────────

async function handleShopBrowse(interaction) {
    await interaction.deferReply({ flags: 64 });

    const rarity = interaction.options.getString('rarity') ?? null;
    const sortBy = interaction.options.getString('sort')   ?? null;

    let entries = getAllStockedEntries({ availableOnly: true });
    if (rarity) entries = entries.filter(e => e.rarity === rarity);
    if (sortBy === 'price_asc')  entries.sort((a, b) => a.price - b.price);
    if (sortBy === 'price_desc') entries.sort((a, b) => b.price - a.price);
    if (sortBy === 'name')       entries.sort((a, b) => a.name.localeCompare(b.name));

    if (entries.length === 0) return interaction.editReply({ content: '🏪 No items match your filters.' });
    return require('../../../buttons/shopBrowse').sendPaged(interaction, 'shopbrowse', entries, { rarity, sortBy });
}

// ─── /league shop search ──────────────────────────────────────────────────────

async function handleShopSearch(interaction) {
    await interaction.deferReply({ flags: 64 });

    const query = interaction.options.getString('name');
    const catalogueMatches = searchCatalogue(query, { limit: 100 });

    const results = catalogueMatches
        .map(item => getBuyableEntry(item.code))
        .filter(entry => entry && entry.available);

    if (results.length === 0) {
        return interaction.editReply({ content: `🔎 No stocked items match \`${query}\`.` });
    }

    return require('../../../buttons/shopSearch').sendResults(interaction, query, results);
}

// ─── /league shop info ────────────────────────────────────────────────────────

async function handleShopInfo(interaction) {
    await interaction.deferReply({ flags: 64 });

    const code = interaction.options.getString('code');
    const stocked = getShopEntry(code);
    const catalogueItem = getCatalogueItemByCode(code);

    if (!catalogueItem) {
        return interaction.editReply({ content: `❌ No item found for \`${code}\`. Try \`/league shop search\`.` });
    }

    if (!stocked && catalogueItem.isVariantCombo) {
        const buyable = getBuyableEntry(code);
        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`${rarityEmoji(catalogueItem.rarity)} ${catalogueItem.name}`)
            .addFields(
                { name: 'Code',   value: `\`${catalogueItem.code}\``, inline: true },
                { name: 'Rarity', value: catalogueItem.rarity, inline: true },
                { name: 'Price',  value: `${formatCurrency(buyable.price)}`, inline: true },
            )
            .setDescription(catalogueItem.description?.slice(0, 500) || 'No description available.')
            .setFooter({ text: 'Magic variant — always available, use /league shop buy to purchase.' });
        return interaction.editReply({ embeds: [embed] });
    }

    const embed = stocked
        ? new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`${rarityEmoji(stocked.rarity)} ${stocked.name}`)
            .addFields(
                { name: 'Code',   value: `\`${stocked.code}\``, inline: true },
                { name: 'Rarity', value: stocked.rarity, inline: true },
                { name: 'Price',  value: `${formatCurrency(stocked.price)}`, inline: true },
                { name: 'Stock',  value: `${stocked.quantity}`, inline: true },
            )
            .setFooter({ text: 'Currently on the shop floor — use /league shop buy to purchase.' })
        : new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle(`${rarityEmoji(catalogueItem.rarity)} ${catalogueItem.name}`)
            .addFields(
                { name: 'Code',   value: `\`${catalogueItem.code}\``, inline: true },
                { name: 'Rarity', value: catalogueItem.rarity, inline: true },
                { name: 'Official Price', value: `${formatCurrency(catalogueItem.priceGp)}`, inline: true },
            )
            .setDescription(catalogueItem.description?.slice(0, 500) || 'No description available.')
            .setFooter({ text: 'Not currently on the shop floor.' });

    return interaction.editReply({ embeds: [embed] });
}

module.exports = {
    handleShopBrowse,
    handleShopSearch,
    handleShopInfo,
};
