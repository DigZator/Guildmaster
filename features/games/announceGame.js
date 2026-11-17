const { fetchGameByUID } = require('../../utils/notion');
const { buildAnnouncementEmbed, buildWhatsApp, sendChunkedText, getPreviewButtons, getPreviewWarnings, setSessionTimeout } = require('./announcementHelper');
const { sessions } = require('./sessionStore');
const { EPHEMERAL } = require('../../shared/utilities/ephemeral');

module.exports = async (interaction, client) => {
    const uid = interaction.options.getString('game');
    if (!uid) {
        await interaction.reply({ content: '❌ Please select a game from the dropdown.', flags: EPHEMERAL });
        return;
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    try {
        const game = await fetchGameByUID(uid);
        if (!game) {
            await interaction.editReply({ content: '❌ Game not found.' });
            return;
        }

        const embed = buildAnnouncementEmbed(game, interaction.guild);
        const whatsapp = buildWhatsApp(game);

        const session = {
            game,
            embed,
            whatsapp,
            channelId: interaction.channel.id
        };
        sessions.set(interaction.user.id, session);
        setSessionTimeout(interaction.user.id);

        let sentFirst = false;
        const send = async payload => {
            if (!sentFirst) { sentFirst = true; return interaction.editReply(payload); }
            else { return interaction.followUp({ ...payload, flags: EPHEMERAL }); }
        };
        const previewMessage = await sendChunkedText(send, whatsapp, {
            prefix: `${getPreviewWarnings(game, embed)}**Preview:**\n`,
            embed,
            components: [getPreviewButtons()],
        });

        session.previewMessageId = previewMessage?.id;

        if (game.artURL) {
            await interaction.followUp({ files: [game.artURL], flags: EPHEMERAL });
        }
    } catch (error) {
        console.error('announce_game error:', error);
        await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
    }
};
