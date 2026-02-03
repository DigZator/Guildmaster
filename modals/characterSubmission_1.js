const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const memorialDrafts = require('../utils/memorialDrafts');

module.exports = async (interaction, client) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== "characterSubmission_1") return;

    const characterData = {
        name: interaction.fields.getTextInputValue('characterName'),
        species: interaction.fields.getTextInputValue('species'),
        class: interaction.fields.getTextInputValue('class'),
        aliases: interaction.fields.getTextInputValue('aliases') || 'N/A',
        faction: interaction.fields.getTextInputValue('faction') || 'N/A',
        authorId: interaction.user.id
    };

    memorialDrafts.set(interaction.user.id, characterData);

    const continueButton = new ButtonBuilder()
        .setCustomId('continue_memorial_part2')
        .setLabel('Continue to Part 2')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('▶️');

    const row = new ActionRowBuilder().addComponents(continueButton);

    await interaction.reply({
        content: `✅ **Part 1 Complete!**\n\n` +
                 `**Character:** ${characterData.name}\n` +
                 `**Species:** ${characterData.species}\n` +
                 `**Class:** ${characterData.class}\n\n` +
                 `**Please keep the Portrait URL and Embed Color handy for the next step.**\n\n` +
                 `Click the button below to continue to Part 2.`,
        components: [row],
        flags: 64
    });
};