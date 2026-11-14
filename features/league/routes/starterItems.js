// The /league routes of the starter items: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
const { route, routes } = require('../../../core/manifest');
const { backgroundAutocomplete } = require('../starterItems/command');
const starterItems = require('../starterItems/buttons');

// Starter-items background autocomplete. Returns true when it answered.
async function autocomplete(interaction, group, sub) {
    if (interaction.commandName === 'league' && sub === 'starter-items') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'background') {
            await backgroundAutocomplete(interaction);
            return true;
        }
    }
    return false;
}

module.exports = {
    buttons: {
        exact: { ...routes('open', starterItems.exact) },
        prefix: { ...routes('open', starterItems.prefix) },
    },
    selects: {
        exact: { starter_items_select: route('open', (i) => require('../starterItems/select')(i)) },
    },
    autocomplete,
};
