const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPageById, getActiveCharacter } = require('../utils/leagueNotion');

module.exports = async (interaction) => {
    const characterId = interaction.values[0];

    await interaction.deferUpdate();

    let character;
    try {
        character = await getPageById(characterId);
    } catch (err) {
        console.error('[leagueDashSwitchSelect] Notion error fetching character:', err);
        return interaction.editReply({ content: 'Could not reach the database. Please try again.', components: [] });
    }

    const ownerDiscordId = character?.properties?.['Discord ID']?.rich_text?.[0]?.plain_text ?? null;
    if (!character || ownerDiscordId !== interaction.user.id) {
        return interaction.editReply({ content: 'That character was not found among your own characters.', components: [] });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const currentStatus  = character.properties['Status']?.select?.name ?? 'Unknown';

    if (currentStatus === 'Active') {
        return interaction.editReply({ content: `${characterName} is already Active.`, components: [] });
    }

    let warningLine = '';
    const currentlyActive = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (currentlyActive && currentlyActive.id !== character.id) {
        const otherName = currentlyActive.properties['Character Name']?.title?.[0]?.plain_text ?? 'your other character';
        warningLine = `\n\nSince you can only have one active character, **${otherName}** will be moved to Passive.`;
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Confirm Character Switch')
        .setDescription(`**${characterName}**: \`${currentStatus}\` → \`Active\`${warningLine}`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`charstatus_confirm:${character.id}:Active`)
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`charstatus_cancel:${character.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({ content: '', embeds: [embed], components: [row] });
};
