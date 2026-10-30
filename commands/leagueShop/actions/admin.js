const { syncCatalogue, getCatalogueMeta } = require('../../../utils/5etoolsCatalogue');
const { syncSpells, getSpellsMeta } = require('../../../utils/5etoolsSpells');
const { stockItem, unstockItem, restockItem } = require('../../../utils/shopFloor');
const { formatCurrency } = require('../../../utils/currency');

// ─── /leagueadmin shop stock ───────────────────────────────────────────────────

async function handleAdminShopStock(interaction) {
    await interaction.deferReply({ flags: 64 });
    const code = interaction.options.getString('code');
    const quantity = interaction.options.getInteger('quantity');
    const price = interaction.options.getInteger('price');

    const result = stockItem(code, { quantity, price });
    if (!result) return interaction.editReply({ content: `❌ No catalogue item found for \`${code}\`. Try \`/leagueadmin catalogue sync\`.` });

    return interaction.editReply({ content: `✅ Stocked **${result.name}** (\`${result.code}\`) — ${result.quantity} @ ${formatCurrency(result.price)}.` });
}

// ─── /leagueadmin shop stockall — bulk-stocks the whole catalogue (or a rarity slice) ──

async function handleAdminShopStockAll(interaction) {
    await interaction.deferReply({ flags: 64 });
    const rarityFilter = interaction.options.getString('rarity');
    const { items } = require('../../../utils/5etoolsCatalogue').loadCatalogue();
    const list = rarityFilter ? items.filter(i => i.rarity === rarityFilter) : items;

    if (!list.length) return interaction.editReply({ content: '❌ Catalogue is empty — run `/leagueadmin catalogue sync` first.' });

    let ok = 0;
    for (const c of list) {
        if (stockItem(c.code)) ok++;
        if (ok % 50 === 0) console.log(`[shop stockall] ${ok}/${list.length}`);
    }
    return interaction.editReply({ content: `✅ Bulk stock complete — **${ok}** stocked${rarityFilter ? ` (rarity: ${rarityFilter})` : ''}.` });
}

// ─── /leagueadmin shop unstock ─────────────────────────────────────────────────

async function handleAdminShopUnstock(interaction) {
    await interaction.deferReply({ flags: 64 });
    const code = interaction.options.getString('code').toUpperCase();
    const item = unstockItem(code);
    if (!item) return interaction.editReply({ content: `❌ No shop item found with code \`${code}\`.` });
    return interaction.editReply({ content: `✅ \`${code}\` removed from the shop floor.` });
}

// ─── /leagueadmin shop restock ─────────────────────────────────────────────────

async function handleAdminShopRestock(interaction) {
    await interaction.deferReply({ flags: 64 });
    const code = interaction.options.getString('code').toUpperCase();
    const item = restockItem(code);
    if (!item) return interaction.editReply({ content: `❌ No shop item found with code \`${code}\`.` });
    return interaction.editReply({ content: `✅ \`${code}\` manually restocked to ${item.quantity}.` });
}

// ─── /leagueadmin catalogue sync ───────────────────────────────────────────────

async function handleAdminCatalogueSync(interaction) {
    await interaction.deferReply({ flags: 0 });

    try {
        const { count, syncedAt } = await syncCatalogue();
        return interaction.editReply({
            content: `✅ Catalogue synced from Open5e (\`srd-2024\`) — **${count}** items loaded at <t:${Math.floor(new Date(syncedAt).getTime() / 1000)}:f>.`,
        });
    } catch (err) {
        console.error('[leagueadmin catalogue sync] Open5e error:', err);
        const meta = getCatalogueMeta();
        return interaction.editReply({
            content: `❌ Sync failed: ${err.message}. Local catalogue still has **${meta.count}** items from the last successful sync.`,
        });
    }
}

// ─── /leagueadmin catalogue sync-spells ────────────────────────────────────────

async function handleAdminSpellsSync(interaction) {
    await interaction.deferReply({ flags: 0 });

    try {
        const { count, syncedAt } = await syncSpells();
        return interaction.editReply({
            content: `✅ Spell list synced — **${count}** spells loaded at <t:${Math.floor(new Date(syncedAt).getTime() / 1000)}:f>.`,
        });
    } catch (err) {
        console.error('[leagueadmin catalogue sync-spells] Sync error:', err);
        const meta = getSpellsMeta();
        return interaction.editReply({
            content: `❌ Sync failed: ${err.message}. Local spell list still has **${meta.count}** spells from the last successful sync.`,
        });
    }
}

module.exports = {
    handleAdminShopStock,
    handleAdminShopStockAll,
    handleAdminShopUnstock,
    handleAdminShopRestock,
    handleAdminCatalogueSync,
    handleAdminSpellsSync,
};
