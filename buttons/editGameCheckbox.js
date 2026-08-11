const { updateGameProperties } = require('../utils/notion');
const { invalidateCache } = require('../utils/cache');
const editGameSession = require('../utils/editGameSession');
const { formatValue } = require('../utils/editGameFormat');

module.exports = {

    prefix: {

        'editgame_checkbox_': async (interaction) => {
            const rest = interaction.customId.replace('editgame_checkbox_', '');
            const lastUnderscore = rest.lastIndexOf('_');
            const ownerId = rest.slice(0, lastUnderscore);
            const choice = rest.slice(lastUnderscore + 1);

            if (interaction.user.id !== ownerId) {
                await interaction.reply({ content: '❌ This isn\'t your edit session.', flags: 64 });
                return;
            }

            await interaction.deferUpdate();

            const session = editGameSession.get(interaction.user.id);
            if (!session) {
                await interaction.editReply({ content: '❌ Session expired. Run `/edit_game` again.', components: [] });
                return;
            }

            try {
                const formattedValue = formatValue(session.fieldType, choice);
                const properties = { [session.notionKey]: formattedValue };

                await updateGameProperties(session.gameId, properties);
                invalidateCache();
                editGameSession.remove(interaction.user.id);

                await interaction.editReply({
                    content: `✅ **${session.fieldName}** set to \`${choice}\` for **${session.gameName}**.`,
                    components: [],
                });
            } catch (error) {
                console.error('[editGameCheckbox] Error:', error);
                await interaction.editReply({
                    content: `❌ Could not update **${session.fieldName}** right now: ${error.message}`,
                    components: [],
                });
            }
        },
    }
};
