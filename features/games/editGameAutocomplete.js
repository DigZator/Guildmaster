const { gameAutocomplete } = require('./gameAutoComplete');
const gameFields = require('../../data/gameFields.json');

// Autocomplete of /edit_game: the game picker for `game`, the Notion field names for `field`.
async function editGameAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'game') {
        await gameAutocomplete(interaction);
        return;
    }

    if (focused.name === 'field') {
        const query = focused.value.toLowerCase();
        const choices = Object.keys(gameFields)
            .filter(f => f.toLowerCase().includes(query))
            .slice(0, 25)
            .map(f => ({ name: f, value: f }));
        await interaction.respond(choices);
    }
}

module.exports = editGameAutocomplete;
