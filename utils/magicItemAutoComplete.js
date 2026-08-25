const { loadCatalogue, getComboCache } = require('./5etoolsCatalogue');
const { getBlueprintById } = require('./downtime');

function formatChoice(item) {
    const name = `${item.name} (${item.rarity})`.slice(0, 100);
    return { name, value: item.name.slice(0, 100) };
}

async function magicItemAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const tierUid = interaction.options.getString('tier'); // rarity now lives on `tier`, not `activity`

    let rarity = null;
    if (tierUid && tierUid !== '__none__') {
        const resolved = getBlueprintById(tierUid.toUpperCase());
        if (resolved?.tier?.value != null && typeof resolved.tier.value === 'string') {
            rarity = resolved.tier.value;
        }
    }

    if (!rarity) {
        await interaction.respond([]);
        return;
    }

    const pool = [...loadCatalogue().items, ...getComboCache()]
        .filter(item => item.isMagic && item.rarity === rarity);

    const matches = focused
        ? pool.filter(item => item.name.toLowerCase().includes(focused))
        : pool;

    await interaction.respond(matches.slice(0, 25).map(formatChoice));
}

module.exports = { magicItemAutocomplete };
