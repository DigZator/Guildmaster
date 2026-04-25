const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { fetchGameByUID } = require('../utils/notion');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { buildAnnouncementEmbed, buildWhatsApp, getRoleMention, getPreviewButtons, setSessionTimeout } = require('../utils/announcementHelper');

module.exports = async (interaction, client) => {
    if (!isAdminChannel(interaction)) {
        await interaction.reply({ content: '❌ This command can only be used in mod channels.', flags: 64 });
        return;
    }

    const uid = interaction.options.getString('game');
    const isManual = interaction.options.getBoolean('manual') ?? false;

    if (isManual) {
        // Store session and hand off to old manual flow
        client.announcementSessions = client.announcementSessions ?? new Map();
        setSessionTimeout(client, interaction.user.id);
        client.announcementSessions.set(interaction.user.id, {
            step: 'awaiting_message',
            channelId: interaction.channel.id
        });

        await interaction.reply({
            content: '📝 **Game Announcement - Manual Mode**\n\n' +
                     'Please send your announcement message wrapped in triple backticks (``` ```).',
            flags: 64
        });
        return;
    }

    if (!uid) {
        await interaction.reply({ content: '❌ Please select a game from the dropdown.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const game = await fetchGameByUID(uid);

        if (!game) {
            await interaction.editReply({ content: '❌ Game not found.' });
            return;
        }

        let artWarning = '';
        if (!game.artURL) {
            artWarning = '⚠️ **No cover art found for this game.** Please upload an image via the Edit menu before confirming.\n\n';
        }

        const embed = buildAnnouncementEmbed(game, interaction.guild);
        const whatsapp = buildWhatsApp(game);

        client.announcementSessions = client.announcementSessions ?? new Map();
        client.announcementSessions.set(interaction.user.id, {
            game,
            embed,
            whatsapp,
            channelId: interaction.channel.id
        });

        await interaction.editReply({
            content: `${artWarning}**Preview:**\n\`\`\`\n${whatsapp}\n\`\`\``,
            embeds: [embed],
            components: [getPreviewButtons()]
        });

    } catch (error) {
        console.error('announce_game error:', error);
        await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
    }
};