const { searchCatalogue, defaultPriceFor } = require('./5etoolsCatalogue');
const { getPriceOverride } = require('./shopFloor');
const { formatCurrency } = require('./currency');

function formatChoice(item) {
    const price = getPriceOverride(item.code) ?? item.priceGp ?? defaultPriceFor(item.rarity);
    return {
        name: `${item.name} (${item.rarity} | ${item.type}) — ${formatCurrency(price)}`.slice(0, 100),
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
