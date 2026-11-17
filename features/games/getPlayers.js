const { getCachedGames } = require('../../shared/data-access/cache');
const { formatPlayerList } = require('./fillout');
const { EPHEMERAL } = require('../../shared/utilities/ephemeral');

module.exports = async (interaction) => {

    const gameUID = interaction.options.getString('game');

    if (!gameUID) {
        await interaction.reply({ content: '❌ Please select a game.', flags: EPHEMERAL });
        return;
    }

    const games = await getCachedGames();
    const game = games?.find(g => g.uid === gameUID);
    if (!game) {
        await interaction.reply({ content: '❌ Game not found.', flags: EPHEMERAL });
        return;
    }

    await interaction.deferReply({ flags: EPHEMERAL });

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
