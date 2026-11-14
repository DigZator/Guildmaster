// The /league routes of the downtime: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
const { routes } = require('../../../core/manifest');
const { downtimeActivityAutocomplete, downtimeTierAutocomplete } = require('../downtime/autocomplete');
const { spellAutocomplete } = require('../../../utils/spellAutoComplete');
const { magicItemAutocomplete } = require('../../../utils/magicItemAutoComplete');
const downtimeBuyDays = require('../downtime/buyDaysButton');

// Downtime start: activity, then tier (depends on activity), then spell / item. Returns true when it answered.
async function autocomplete(interaction, group, sub) {
    if (interaction.commandName === 'league' && group === 'downtime' && sub === 'start') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'activity') {
            await downtimeActivityAutocomplete(interaction);
            return true;
        }
        if (focused.name === 'tier') {
            await downtimeTierAutocomplete(interaction);
            return true;
        }
        if (focused.name === 'spell') {
            await spellAutocomplete(interaction);
            return true;
        }
        if (focused.name === 'item') {
            await magicItemAutocomplete(interaction);
            return true;
        }
    }
    return false;
}

module.exports = {
    buttons: { exact: { ...routes('open', downtimeBuyDays.exact) } },
    autocomplete,
};
