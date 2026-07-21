const path = require('path');
const {
    loadClasses,
    loadBackgrounds,
    loadCategoryIndex,
} = require('../utils/starterEquipmentData');
const { buildInitialSession } = require('../utils/starterEquipmentFlow');
const { getActiveCharacter } = require('../utils/leagueNotion');
const starterItemsButtons = require('../buttons/starterItems');

const FIVEE_DATA_DIR = path.join(__dirname, '..', '..', '5etools-src', 'data');

function buildClassChoices() {
    const classes = loadClasses(FIVEE_DATA_DIR);
    return classes
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 25)
        .map(c => ({
            name: `${c.name} (${c.source}) — ${c.preview}`,
            value: c.key,
        }));
}

async function backgroundAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const backgrounds = loadBackgrounds(FIVEE_DATA_DIR);

    const choices = backgrounds
        .filter(b => b.name.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(b => ({
            name: `${b.name} (${b.source}) — ${b.preview}`,
            value: b.key,
        }));

    await interaction.respond(choices);
}

async function leagueStarterItems(interaction) {
    await interaction.deferReply({ flags: 64 });

    let character;
    try {
        character = await getActiveCharacter(interaction.user.id);
    } catch (err) {
        console.error('[starter-items] Notion error fetching character:', err);
        return interaction.editReply({ content: 'Could not reach the database. Please try again.' });
    }
    if (!character) {
        return interaction.editReply({ content: 'You do not have an active character. Use `/league create` to register one.' });
    }

    if (character.properties['Got SE']?.checkbox) {
        return interaction.editReply({ content: '❌ You have already claimed your starting equipment for this character.' });
    }

    const classKey = interaction.options.getString('class');
    const backgroundKey = interaction.options.getString('background');

    const classes = loadClasses(FIVEE_DATA_DIR);
    const backgrounds = loadBackgrounds(FIVEE_DATA_DIR);
    const categoryIndex = loadCategoryIndex(FIVEE_DATA_DIR);

    const classData = classes.find(c => c.key === classKey);
    const backgroundData = backgrounds.find(b => b.key === backgroundKey);

    if (!classData || !backgroundData) {
        return interaction.editReply({ content: '❌ Could not find that class or background. Try selecting from the list again.' });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    const session = buildInitialSession({
        classData,
        backgroundData,
        categoryIndex,
        characterId: character.id,
        characterName,
    });

    await starterItemsButtons.renderStep(interaction, session);
}

module.exports = { leagueStarterItems, backgroundAutocomplete, buildClassChoices };
