const { EmbedBuilder } = require('discord.js');
const { formatCurrency } = require('../../utils/currency');
const { PAGE_SIZE, MARKETPLACE_TAX_RATE } = require('./constants');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rarityEmoji(rarity) {
    return { Common: '⚪', Uncommon: '🟢', Rare: '🔵', 'Very Rare': '🟣', Legendary: '🟠' }[rarity] ?? '⚫';
}

function buildShopEmbed(entries, page, totalPages, filters) {
    const start = page * PAGE_SIZE;
    const slice = entries.slice(start, start + PAGE_SIZE);

    const filterDesc = [
        filters.rarity ? `Rarity: ${filters.rarity}` : null,
        filters.sortBy ? `Sort: ${filters.sortBy}`   : null,
    ].filter(Boolean).join(' · ');

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🏪 Guild Shop')
        .setFooter({ text: `Page ${page + 1} of ${totalPages} · ${entries.length} item(s)${filterDesc ? ` · ${filterDesc}` : ''}` })
        .setTimestamp();

    if (slice.length === 0) {
        embed.setDescription('No items available.');
        return embed;
    }

    const rows = slice.map(e => {
        const name = e.name.padEnd(24).slice(0, 24);
        return `\`${e.code}\`  ${rarityEmoji(e.rarity)} ${name}  ${formatCurrency(e.price).padStart(12)}  ×${e.quantity}`;
    });

    const header  = `${'Code'.padEnd(6)}  ${'Item'.padEnd(26)}  ${'Price'.padStart(8)}  Stock`;
    const divider = '─'.repeat(54);
    embed.setDescription(`\`\`\`\n${header}\n${divider}\n${rows.join('\n')}\n\`\`\`\nUse \`/league shop buy <code>\` to purchase.`);
    return embed;
}

function buildMarketEmbed(listings, page, totalPages, filters) {
    const start = page * PAGE_SIZE;
    const slice = listings.slice(start, start + PAGE_SIZE);

    const filterDesc = [
        filters.rarity ? `Rarity: ${filters.rarity}` : null,
        filters.sortBy ? `Sort: ${filters.sortBy}`   : null,
    ].filter(Boolean).join(' · ');

    const embed = new EmbedBuilder()
        .setColor(0x1abc9c)
        .setTitle('🏬 Player Marketplace')
        .setFooter({ text: `Page ${page + 1} of ${totalPages} · ${listings.length} listing(s)${filterDesc ? ` · ${filterDesc}` : ''}` })
        .setTimestamp();

    if (slice.length === 0) {
        embed.setDescription('No listings available.');
        return embed;
    }

    const rows = slice.map(listing => {
        const p      = listing.properties;
        const id     = p['Listing ID']?.title?.[0]?.plain_text ?? '????';
        const item   = (listing._itemName ?? 'Unknown').padEnd(24);
        const rarity = listing._itemRarity ?? '—';
        const price  = p['Asking Price']?.number ?? 0;
        return `\`${id}\`  ${rarityEmoji(rarity)} ${item}  ${formatCurrency(price).padStart(10)}`;
    });

    const header  = `${'ID'.padEnd(6)}  ${'Item'.padEnd(26)}  ${'Price'.padStart(8)}`;
    const divider = '─'.repeat(46);
    embed.setDescription(`\`\`\`\n${header}\n${divider}\n${rows.join('\n')}\n\`\`\`\nUse \`/league marketplace buy <id>\` to purchase. A ${Math.round(MARKETPLACE_TAX_RATE * 100)}% tax on the item's value is deducted from the seller's proceeds on every sale.`);
    return embed;
}

module.exports = {
    rarityEmoji,
    buildShopEmbed,
    buildMarketEmbed,
};
