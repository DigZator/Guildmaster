// The /league routes of the dashboard: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
const { route, routes } = require('../../../core/manifest');
const leagueDashboard = require('../dashboard/dashboard');

module.exports = {
    buttons: { exact: { ...routes('open', leagueDashboard.exact) } },
    modals: {
        prefix: { 'leagueDashEditModal:': route('open', (i) => require('../dashboard/editModal')(i)) },
    },
    selects: {
        exact: { leagueDashSwitchSelect: route('open', (i) => require('../dashboard/switchSelect')(i)) },
    },
};
