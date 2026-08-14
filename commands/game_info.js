const { buildAnnouncementEmbed } = require('../utils/announcementHelper');
const { fetchGameByUID } = require('../utils/notion');

module.exports = async (interaction, client) => {
    const uid = interaction.options.getString('uid');
    const isPublic = interaction.options.getBoolean('public') ?? true;
    await interaction.deferReply({ flags: isPublic ? 0 : 64 });
    try {
        const game = await fetchGameByUID(uid);
        if (!game) {
            await interaction.editReply({ content: '❌ Game not found. Check the UID and try again.' });
            return;
        }

        const embed = buildAnnouncementEmbed(game, interaction.guild, { showSeats: true });
        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('game_info error:', error);
        await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
    }
};
