// The routes of /league, /leagueadmin, /leaguedm and the league buttons, modals and selects. Each area keeps its own
// routes in ./routes/<area>.js; the lists below put them together in the order the old single manifest had them, because
// the order of the keys decides which prefix route wins.
const { league } = require('./command');
const { leagueAdmin, leagueDM } = require('./grants');
const { leagueAutocomplete } = require('./autocomplete');
const shop = require('./routes/shop');
const downtime = require('./routes/downtime');
const starterItems = require('./routes/starterItems');
const dashboard = require('./routes/dashboard');
const inventory = require('./routes/inventory');
const leaderboard = require('./routes/leaderboard');
const character = require('./routes/character');
const quests = require('./routes/quests');

const LEAGUE_ADMIN_DENIED = '❌ You must be an admin or use this in the league admin channel.';
const leagueAutocompleteEntries = [{ name: 'league / leagueadmin / leaguedm', policy: 'open', handle: leagueAutocomplete }];

module.exports = {
    name: 'league',
    commands: [
        // Player commands: no role check today (several check for an active character inside the handler).
        { name: 'league', policy: 'open', handler: league, autocomplete: leagueAutocompleteEntries },
        // Everything under /leagueadmin, enforced by the router: admin role OR the league-admin / control channel
        // (the old quirk, kept on purpose). Every subcommand used to check this at the top of its handler.
        { name: 'leagueadmin', policy: 'league_legacy', denied: LEAGUE_ADMIN_DENIED, handler: leagueAdmin, autocomplete: leagueAutocompleteEntries },
        { name: 'leaguedm', policy: 'open', gate: 'own: DM role', handler: leagueDM, autocomplete: leagueAutocompleteEntries },
    ],
    buttons: {
        exact: {
            ...shop.buttons.exact,
            ...downtime.buttons.exact,
            ...starterItems.buttons.exact,
            ...dashboard.buttons.exact,
        },
        prefix: {
            ...inventory.buttons.prefix,
            ...shop.buttons.prefix,
            ...starterItems.buttons.prefix,
            ...leaderboard.buttons.prefix,
            ...character.buttons.prefix,
            ...quests.buttons.prefix,
        },
    },
    modals: {
        exact: { ...character.modals.exact },
        prefix: {
            ...dashboard.modals.prefix,
            ...quests.modals.prefix,
        },
    },
    selects: {
        exact: {
            ...shop.selects.exact,
            ...starterItems.selects.exact,
            ...dashboard.selects.exact,
        },
        prefix: { ...quests.selects.prefix },
    },
    userSelects: {
        prefix: { ...quests.userSelects.prefix },
    },
};
