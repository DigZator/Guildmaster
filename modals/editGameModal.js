const { updateGameProperties } = require('../utils/notion');
const { invalidateCache } = require('../utils/cache');
const editGameSession = require('../utils/editGameSession');
const { formatValue } = require('../utils/editGameFormat');

module.exports = async (interaction, client) => {
    const session = editGameSession.get(interaction.user.id);

    if (!session) {
        await interaction.reply({ content: '❌ Session expired. Run `/edit_game` again.', flags: 64 });
        return;
    }

    const raw = interaction.fields.getTextInputValue('value').trim();

    try {
        const formattedValue = formatValue(session.fieldType, raw);
        const properties = { [session.notionKey]: formattedValue };

        await updateGameProperties(session.gameId, properties);
        invalidateCache();
        editGameSession.remove(interaction.user.id);

        await interaction.reply({
            content: `✅ **${session.fieldName}** updated for **${session.gameName}**.`,
            flags: 64,
        });
    } catch (error) {
        console.error('[editGameModal] Error:', error);
        await interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    }
};
