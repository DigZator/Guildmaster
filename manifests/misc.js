const { routes } = require('../core/manifest');
const ping = require('../commands/ping');
const keep_alive = require('../commands/keep_alive');
const help = require('../commands/help');
const game_info = require('../commands/game_info');
const deletions = require('../buttons/confirmDelete');
const { gameAutocomplete } = require('../utils/gameAutoComplete');
const helpData = require('../helpData');

async function helpAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'family') {
        const group = interaction.options.getString('group');
        const groupData = helpData[group];
        const query = focused.value.toLowerCase();

        const choices = groupData
            ? Object.entries(groupData)
                .filter(([key, fam]) => key.toLowerCase().includes(query) || fam.label.toLowerCase().includes(query))
                .slice(0, 25)
                .map(([key, fam]) => ({ name: fam.label, value: key }))
            : [{ name: 'Pick a group first', value: 'none' }];

        await interaction.respond(choices);
    }
}

module.exports = {
    name: 'misc',
    commands: [
        { name: 'ping', policy: 'open', handler: ping },
        { name: 'keep_alive', policy: 'open', handler: keep_alive },
        { name: 'help', policy: 'open', handler: help, autocomplete: [{ name: 'family', policy: 'open', handle: helpAutocomplete }] },
        { name: 'game_info', policy: 'open', handler: game_info, autocomplete: [{ name: 'games', policy: 'open', handle: gameAutocomplete }] },
    ],
    buttons: {
        // confirm_remove_ / cancel_remove_: the handler checks the person who started the removal.
        prefix: routes('open', deletions.prefix, { gate: 'own: the person who started the removal' }),
    },
};
