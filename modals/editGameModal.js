const { EmbedBuilder } = require('discord.js');
const { updateGameProperties } = require('../utils/notion');
const { invalidateCache } = require('../utils/cache');
const editGameSession = require('../utils/editGameSession');
const { formatValue } = require('../utils/editGameFormat');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

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

        const ctrlChannel = GUILDMASTER_CTRL_CHANNEL_ID ? interaction.guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID) : null;
        if (ctrlChannel) {
            await ctrlChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xfee75c)
                        .setTitle('✏️ Announcement Field Edited')
                        .addFields(
                            { name: 'Game',    value: session.gameName,                                 inline: true },
                            { name: 'Field',   value: session.fieldName,                                inline: true },
                            { name: 'Edited by', value: `<@${interaction.user.id}>`,                    inline: true },
                            { name: 'Before',  value: session.previousValue ? `\`${String(session.previousValue).slice(0, 1000)}\`` : '_(empty)_', inline: false },
                            { name: 'After',   value: raw ? `\`${raw.slice(0, 1000)}\`` : '_(empty)_',  inline: false },
                        )
                        .setTimestamp(),
                ],
            }).catch(e => console.error('[editGameModal] Failed to post edit log to guildmaster-ctrl:', e));
        } else {
            console.warn('[editGameModal] GUILDMASTER_CTRL_CHANNEL_ID not configured or channel not found — skipped edit log.');
        }
    } catch (error) {
        console.error('[editGameModal] Error:', error);
        await interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    }
};
