const { searchCatalogue } = require('./5etoolsCatalogue');

function formatChoice(item) {
    return {
        name: `${item.name} (${item.rarity} | ${item.type})`.slice(0, 100),
        value: item.code,
    };
}

async function catalogueAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    if (!focused) return interaction.respond([]);

    const matches = searchCatalogue(focused, { limit: 25 });
    await interaction.respond(matches.map(formatChoice));
}

module.exports = { catalogueAutocomplete };
