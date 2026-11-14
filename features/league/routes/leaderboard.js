// The /league routes of the leaderboard: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
const { routes } = require('../../../core/manifest');
const leaderboard = require('../leaderboard/button');

module.exports = {
    buttons: { prefix: { ...routes('open', leaderboard.prefix) } },
};
