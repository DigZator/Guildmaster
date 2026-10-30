const { isAdminChannel } = require('../../utils/isAdminChannel');
const { handleShopBrowse, handleShopSearch, handleShopInfo } = require('./actions/shopBrowse');
const { handleShopBuy } = require('./actions/shopBuy');
const { handleShopSell } = require('./actions/shopSell');
const { handleMarketplaceBrowse, handleMarketplaceList, handleMarketplaceUnlist } = require('./actions/marketplaceListings');
const { handleMarketplaceBuy } = require('./actions/marketplaceBuy');
const {
    handleAdminShopStock,
    handleAdminShopStockAll,
    handleAdminShopUnstock,
    handleAdminShopRestock,
    handleAdminCatalogueSync,
    handleAdminSpellsSync,
} = require('./actions/admin');

// ─── Routers ──────────────────────────────────────────────────────────────────

async function leagueShop(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'browse': 	return handleShopBrowse(interaction);
        case 'search': 	return handleShopSearch(interaction);
        case 'info': 	return handleShopInfo(interaction);
        case 'buy': 	return handleShopBuy(interaction);
        case 'sell':	return handleShopSell(interaction);
    }
}

async function leagueAdminShop(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'stock':   	return handleAdminShopStock(interaction);
        case 'unstock': 	return handleAdminShopUnstock(interaction);
        case 'stockall':	return handleAdminShopStockAll(interaction);
        case 'restock': 	return handleAdminShopRestock(interaction);
    }
}

async function leagueAdminCatalogue(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'sync':        return handleAdminCatalogueSync(interaction);
        case 'sync-spells': return handleAdminSpellsSync(interaction);
    }
}

async function leagueMarketplace(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'browse':      return handleMarketplaceBrowse(interaction);
        case 'buy':         return handleMarketplaceBuy(interaction);
        case 'list':        return handleMarketplaceList(interaction);
        case 'unlist':      return handleMarketplaceUnlist(interaction);
    }
}

module.exports = {
    leagueShop,
    leagueAdminShop,
    leagueAdminCatalogue,
    leagueMarketplace,
};
