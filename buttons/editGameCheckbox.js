const { EmbedBuilder } = require('discord.js');
const { updateGameProperties } = require('../utils/notion');
const { invalidateCache } = require('../utils/cache');
const editGameSession = require('../utils/editGameSession');
const { formatValue } = require('../utils/editGameFormat');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

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

                const ctrlChannel = GUILDMASTER_CTRL_CHANNEL_ID ? interaction.guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID) : null;
                if (ctrlChannel) {
                    await ctrlChannel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xfee75c)
                                .setTitle('✏️ Announcement Field Edited')
                                .addFields(
                                    { name: 'Game',      value: session.gameName,                       inline: true },
                                    { name: 'Field',     value: session.fieldName,                       inline: true },
                                    { name: 'Edited by', value: `<@${interaction.user.id}>`,              inline: true },
                                    { name: 'Before',    value: session.previousValue ? `\`${String(session.previousValue).slice(0, 1000)}\`` : '_(empty)_', inline: false },
                                    { name: 'After',     value: `\`${choice}\``,                          inline: false },
                                )
                                .setTimestamp(),
                        ],
                    }).catch(e => console.error('[editGameCheckbox] Failed to post edit log to guildmaster-ctrl:', e));
                } else {
                    console.warn('[editGameCheckbox] GUILDMASTER_CTRL_CHANNEL_ID not configured or channel not found — skipped edit log.');
                }
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
