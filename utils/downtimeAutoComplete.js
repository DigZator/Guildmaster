const { listActivityChoices, listTierChoices } = require('./downtime');

async function downtimeActivityAutocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const choices = listActivityChoices(focused)
        .slice(0, 25)
        .map(c => ({ name: `${c.name}${c.needsTier ? ' (pick a tier next)' : ''}`, value: c.key }));
    await interaction.respond(choices);
}

async function downtimeTierAutocomplete(interaction) {
    const key = interaction.options.getString('activity');
    const focused = interaction.options.getFocused();
    if (!key) {
        await interaction.respond([{ name: 'Pick an activity first', value: '__none__' }]);
        return;
    }
    const choices = listTierChoices(key, focused)
        .slice(0, 25)
        .map(c => ({ name: c.label, value: c.id }));
    await interaction.respond(choices.length ? choices : [{ name: 'No tiers found for that activity', value: '__none__' }]);
}

module.exports = { downtimeActivityAutocomplete, downtimeTierAutocomplete };
