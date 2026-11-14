// The /league routes of the character commands: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
const { route, routes } = require('../../../core/manifest');
const { characterLogAutocomplete, characterOwnAutocomplete } = require('../character/autocomplete');
const characterStatus = require('../character/statusButton');

// Character autocomplete: the quest log's character, then the own characters of /league character status.
// Returns true when it answered.
async function autocomplete(interaction, group, sub) {
    // Character autocomplete (league log)
    if (interaction.commandName === 'league' && sub === 'log') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'character') {
            await characterLogAutocomplete(interaction);
            return true;
        }
    }

    // Character autocomplete (league character status): own characters only
    if (interaction.commandName === 'league' && group === 'character' && sub === 'status') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'character') {
            await characterOwnAutocomplete(interaction);
            return true;
        }
    }
    return false;
}

module.exports = {
    buttons: { prefix: { ...routes('open', characterStatus.prefix) } },
    modals: {
        exact: { leagueCreate: route('open', (i, c) => require('../character/createSubmit').handleLeagueCreate(i, c)) },
    },
    autocomplete,
};
