const { searchSpells } = require('./5etoolsSpells');
const { getBlueprintById } = require('./downtime');

function formatChoice(spell) {
    const levelLabel = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
    return {
        name: `${spell.name} (${levelLabel} | ${spell.school})`.slice(0, 100),
        value: spell.name.slice(0, 100),
    };
}

async function spellAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const tierUid = interaction.options.getString('tier'); // spell level now lives on `tier`, not `activity`

    let level = null;
    if (tierUid && tierUid !== '__none__') {
        const resolved = getBlueprintById(tierUid.toUpperCase());
        if (resolved?.tier?.value != null && typeof resolved.tier.value === 'number') {
            level = resolved.tier.value;
        }
    }

    const matches = searchSpells(focused, { level, limit: 25 });
    await interaction.respond(matches.map(formatChoice));
}

module.exports = { spellAutocomplete };
