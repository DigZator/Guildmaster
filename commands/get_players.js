const { isAdminChannel } = require('../utils/isAdminChannel');
const { getCachedGames } = require('../utils/cache');
const { formatPlayerList } = require('../utils/fillout');

module.exports = async (interaction) => {
    // --- Admin-only gate ---------------------------------------------------
    if (!isAdminChannel(interaction)) {
        await interaction.reply({ content: '❌ This command can only be used in the admin channel.', flags: 64 });
        return;
    }
    // ------------------------------------------------------------------------

    const gameUID = interaction.options.getString('game');

    if (!gameUID) {
        await interaction.reply({ content: '❌ Please select a game.', flags: 64 });
        return;
    }

    const games = await getCachedGames();
    const game = games?.find(g => g.uid === gameUID);
    if (!game) {
        await interaction.reply({ content: '❌ Game not found.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const totalSeats = game.totalSeats ?? 4;
        const list = await formatPlayerList(gameUID, totalSeats);

        await interaction.editReply({
            content: `📋 **${game.title.trim()}** — Player Sign-ups\n${list}`,
        });
    } catch (error) {
        console.error('get_players error:', error);
        await interaction.editReply({ content: '❌ Failed to fetch player list. Please try again.' });
    }
};
