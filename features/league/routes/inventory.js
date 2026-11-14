// The /league routes of the inventory: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
const { routes } = require('../../../core/manifest');
const inventory = require('../inventory/button');

module.exports = {
    buttons: { prefix: { ...routes('open', inventory.prefix) } },
    itemTargets: ['league:item'],
};
