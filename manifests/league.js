const { route, routes } = require('../core/manifest');
const { league } = require('../commands/league');
const { leagueAdmin, leagueDM } = require('../commands/leagueGrants');
const inventory = require('../buttons/inventory');
const shopSearch = require('../buttons/shopSearch');
const shopBrowse = require('../buttons/shopBrowse');
const shopDiscount = require('../buttons/shopDiscount');
const shopSell = require('../buttons/shopSell');
const downtimeBuyDays = require('../buttons/downtimeBuyDays');
const starterItems = require('../buttons/starterItems');
const leaderboard = require('../buttons/leaderboard');
const characterStatus = require('../buttons/characterStatus');
const questDashboard = require('../buttons/questDashboard');
const leagueDashboard = require('../buttons/leagueDashboard');

module.exports = {
    name: 'league',
    commands: [
        // Player commands: no role check today (several check for an active character inside the handler).
        { name: 'league', policy: 'open', handler: league },
        // Everything under /leagueadmin: admin role OR the league-admin / control channel.
        { name: 'leagueadmin', policy: 'open', gate: 'league_legacy', handler: leagueAdmin },
        { name: 'leaguedm', policy: 'open', gate: 'own: DM role', handler: leagueDM },
    ],
    buttons: {
        exact: {
            ...routes('open', shopDiscount.exact),
            ...routes('open', shopSell.exact),
            ...routes('open', downtimeBuyDays.exact),
            ...routes('open', starterItems.exact),
            ...routes('open', leagueDashboard.exact),
        },
        prefix: {
            ...routes('open', inventory.prefix),
            ...routes('open', shopSearch.prefix),
            ...routes('open', shopBrowse.prefix),
            ...routes('open', starterItems.prefix),
            ...routes('open', leaderboard.prefix),
            ...routes('open', characterStatus.prefix),
            ...routes('open', questDashboard.prefix),
        },
    },
    modals: {
        exact: { leagueCreate: route('open', (i, c) => require('../interactions/leagueCreateModal').handleLeagueCreate(i, c)) },
        prefix: {
            'leagueDashEditModal:': route('open', (i) => require('../modals/leagueDashEdit')(i)),
            'questDash:': route('open', (i) => require('../buttons/questDashboard').handleDashboardModal(i)),
        },
    },
    selects: {
        exact: {
            shopbuy_discount_select: route('open', (i) => require('../selects/shopDiscountSelect')(i)),
            starter_items_select: route('open', (i) => require('../selects/starterItemsSelect')(i)),
            leagueDashSwitchSelect: route('open', (i) => require('../selects/leagueDashSwitchSelect')(i)),
        },
        prefix: { 'questDash:': route('open', (i) => require('../buttons/questDashboard').handleDashboardSelect(i)) },
    },
    userSelects: {
        prefix: { 'questDash:': route('open', (i) => require('../buttons/questDashboard').handleDashboardUserSelect(i)) },
    },
};
