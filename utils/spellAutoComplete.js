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
    const uid = interaction.options.getString('activity');

    let level = null;
    if (uid) {
        const resolved = getBlueprintById(uid.toUpperCase());
        if (resolved?.tier?.value != null && typeof resolved.tier.value === 'number') {
            level = resolved.tier.value;
        }
    }

    const matches = searchSpells(focused, { level, limit: 25 });
    await interaction.respond(matches.map(formatChoice));
}

module.exports = { spellAutocomplete };
