const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { fetchGameByUID } = require('../utils/notion');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { buildAnnouncementEmbed, buildWhatsApp, getRoleMention, getPreviewButtons, setSessionTimeout } = require('../utils/announcementHelper');
const { sessions } = require('../utils/sessionStore');

module.exports = async (interaction, client) => {
    if (!isAdminChannel(interaction)) {
        await interaction.reply({ content: '❌ This command can only be used in mod channels.', flags: 64 });
        return;
    }
    const uid = interaction.options.getString('game');
    const isManual = interaction.options.getBoolean('manual') ?? false;
    if (isManual) {
        setSessionTimeout(interaction.user.id);
        sessions.set(interaction.user.id, {
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
        sessions.set(interaction.user.id, {
            game,
            embed,
            whatsapp,
            channelId: interaction.channel.id
        });

        const previewText = `${artWarning}**Preview:**\n\`\`\`\n${whatsapp}\n\`\`\``;

        if (previewText.length <= 2000) {
            await interaction.editReply({
                content: previewText,
                embeds: [embed],
                components: [getPreviewButtons()]
            });
        } else {
            await interaction.editReply({
                content: artWarning || null,
                embeds: [embed],
                components: [getPreviewButtons()]
            });

            const chunkSize = 1900;
            const lines = whatsapp.split('\n');
            let currentChunk = '';

            for (const line of lines) {
                if ((currentChunk + '\n' + line).length > chunkSize && currentChunk.length > 0) {
                    await interaction.followUp({ content: `\`\`\`\n${currentChunk}\n\`\`\``, flags: 64 });
                    currentChunk = line;
                } else {
                    currentChunk = currentChunk ? currentChunk + '\n' + line : line;
                }
            }
            if (currentChunk) {
                await interaction.followUp({ content: `\`\`\`\n${currentChunk}\n\`\`\``, flags: 64 });
            }
        }

        if (game.artURL) {
            await interaction.followUp({ files: [game.artURL], flags: 64 });
        }
    } catch (error) {
        console.error('announce_game error:', error);
        await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
    }
};
