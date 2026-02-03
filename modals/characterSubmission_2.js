const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const memorialDrafts = require('../utils/memorialDrafts');

const previewButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('memorial_preview_confirm')
        .setLabel("Submit")
        .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
        .setCustomId('memorial_preview_cancel')
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
)

module.exports = async (interaction, client) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== "characterSubmission_2") return;

    await interaction.deferReply({ flags: 64 });

    const storedData = memorialDrafts.get(interaction.user.id);
    if (!storedData) {
        await interaction.editReply({
            content: "Error: Your session expired. Please start over.",
            flags: 64
        });
        return;
    }

    const backstory = interaction.fields.getTextInputValue('backstory');
    const mannerOfDeath = interaction.fields.getTextInputValue('mannerOfDeath');
    const campaign = interaction.fields.getTextInputValue('campaign') || 'N/A';
    const portraitURL = interaction.fields.getTextInputValue('portraitURL');
    const embedColorInput = interaction.fields.getTextInputValue('embedColor');

    let embedColor = 0xFFFFFF;

    if (embedColorInput) {
        try {
            const cleanColor = embedColorInput.replace('#', '');
            embedColor = parseInt(cleanColor, 16);
        } catch (err) {
            console.log('Invalid color, using default');
        }
    }

    const outputChannel = interaction.guild.channels.cache.find(
        channel => channel.name === 'the-long-rest'
    );

    if (!outputChannel) {
        await interaction.editReply({
            content: 'Output channel not found. Contact an admin.',
            flags: 64
        });
        return;
    }

    // Build embed
    const embed = new EmbedBuilder()
        .setTitle(storedData.name)
        .setImage(portraitURL)
        .setColor(embedColor)
        .addFields(
            { name: 'Species', value: storedData.species, inline: true },
            { name: 'Class/Subclass', value: storedData.class, inline: true },
            { name: 'Aliases', value: storedData.aliases, inline: false },
            { name: 'Faction', value: storedData.faction, inline: true },
            { name: 'Backstory', value: backstory, inline: false },
            { name: 'Manner of Death', value: mannerOfDeath, inline: false },
            { name: 'Campaign', value: campaign, inline: false }
        )
        .setFooter({ text: `Submitted by ${interaction.user.tag} | AuthorID: ${interaction.user.id}` })
        .setTimestamp();

    memorialDrafts.set(
        interaction.user.id, {
            embed,
            storedData,
            portraitURL,
            embedColor
        }
    )

    await interaction.editReply({
        content: 'Here’s a preview of your submission. Please confirm:',
        embeds: [embed],
        components: [previewButtons]
    });
};
