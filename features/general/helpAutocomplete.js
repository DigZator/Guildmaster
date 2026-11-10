const helpData = require('../../helpData');

// Autocomplete for /help: the "family" option offers the families of the group picked first.
module.exports = async function helpAutocomplete(interaction) {
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
};
