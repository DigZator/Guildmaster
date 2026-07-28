const { EmbedBuilder } = require('discord.js');
const { getPageById, getActiveCharacter, setCharacterStatus, withTwoPageLocks, withPageLock } = require('../utils/leagueNotion');
const { sendAdminLog } = require('../utils/adminLog');

module.exports = {

    prefix: {

        'charstatus_confirm:': async (interaction) => {
            const [, characterId, newStatus] = interaction.customId.split(':');

            let character;
            try {
                character = await getPageById(characterId);
            } catch (err) {
                console.error('[characterStatus] Notion error fetching character:', err);
                return interaction.update({ content: '❌ Could not reach the database. Please try again.', embeds: [], components: [] });
            }

            const ownerDiscordId = character?.properties?.['Discord ID']?.rich_text?.[0]?.plain_text ?? null;
            if (!character || ownerDiscordId !== interaction.user.id) {
                return interaction.update({ content: '❌ That character could not be verified as yours.', embeds: [], components: [] });
            }

            const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
            const oldStatus     = character.properties['Status']?.select?.name ?? 'Unknown';

            if (oldStatus === newStatus) {
                return interaction.update({ content: `**${characterName}** is already **${newStatus}**.`, embeds: [], components: [] });
            }

            let demotedName = null;

            try {
                if (newStatus === 'Active') {
                    const currentlyActive = await getActiveCharacter(interaction.user.id);
                    if (currentlyActive && currentlyActive.id !== character.id) {
                        demotedName = currentlyActive.properties['Character Name']?.title?.[0]?.plain_text ?? 'your other character';
                        await withTwoPageLocks(currentlyActive.id, character.id, async () => {
                            await setCharacterStatus(currentlyActive.id, 'Passive');
                            await setCharacterStatus(character.id, 'Active');
                        });
                    } else {
                        await withPageLock(character.id, () => setCharacterStatus(character.id, 'Active'));
                    }
                } else {
                    await withPageLock(character.id, () => setCharacterStatus(character.id, newStatus));
                }
            } catch (err) {
                console.error('[characterStatus] Notion update error:', err);
                return interaction.update({ content: `❌ Failed to update status for **${characterName}**. Please try again.`, embeds: [], components: [] });
            }

            try {
                await sendAdminLog(interaction.guild, new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle('Character Status Changed')
                    .addFields(
                        { name: 'Player', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Character', value: characterName, inline: true },
                        { name: 'Change', value: `\`${oldStatus}\` → \`${newStatus}\``, inline: true },
                        ...(demotedName ? [{ name: 'Also demoted', value: `${demotedName} → Passive` }] : []),
                    )
                    .setTimestamp()
                );
            } catch (err) {
                console.warn('[characterStatus] Failed to send admin log:', err.message);
            }

            const confirmationLine = demotedName
                ? `✅ **${characterName}** is now **${newStatus}**. **${demotedName}** was moved to **Passive**.`
                : `✅ **${characterName}** is now **${newStatus}**.`;

            return interaction.update({ content: confirmationLine, embeds: [], components: [] });
        },

        'charstatus_cancel:': async (interaction) => {
            return interaction.update({ content: 'Status change cancelled.', embeds: [], components: [] });
        },
    }
};
