// The /league routes of the shop and marketplace: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
const { routes, route } = require('../../../core/manifest');
const shopSearch = require('../shop/buttons/search');
const shopBrowse = require('../shop/buttons/browse');
const shopDiscount = require('../shop/buttons/discount');
const shopSell = require('../shop/buttons/sell');

module.exports = {
    buttons: {
        exact: {
            ...routes('open', shopDiscount.exact),
            ...routes('open', shopSell.exact),
        },
        prefix: {
            ...routes('open', shopSearch.prefix),
            ...routes('open', shopBrowse.prefix),
        },
    },
    selects: {
        exact: { shopbuy_discount_select: route('open', (i) => require('../shop/discountSelect')(i)) },
    },
    // Autocomplete keys (command:group:subcommand): the catalogue code, and the player's own items.
    codeTargets: ['league:shop:info', 'league:shop:buy', 'leagueadmin:shop:stock', 'leagueadmin:shop:unstock', 'leagueadmin:shop:restock'],
    itemTargets: ['league:marketplace:list', 'league:shop:sell'],
};
