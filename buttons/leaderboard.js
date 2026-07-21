const { buildLeaderboardEmbedAndRow, LEADERBOARD_PAGE_SIZE } = require('../commands/league');

async function handleLeaderboardPage(interaction, client) {
    const [, sessionId, direction] = interaction.customId.split(':');
    const session = client.leaderboardSessions.get(sessionId);

    if (!session) {
        return interaction.reply({
            content: '❌ This leaderboard has expired. Please run `/league leaderboard` again.',
            flags: 64,
        });
    }

    if (interaction.user.id !== session.requesterId) {
        return interaction.reply({
            content: '❌ Only the person who ran this command can page through it.',
            flags: 64,
        });
    }

    const totalPages = Math.max(1, Math.ceil(session.rows.length / LEADERBOARD_PAGE_SIZE));
    if (direction === 'prev') session.page = Math.max(0, session.page - 1);
    if (direction === 'next') session.page = Math.min(totalPages - 1, session.page + 1);

    const payload = buildLeaderboardEmbedAndRow(session, sessionId);
    return interaction.update(payload);
}

module.exports = {
    prefix: {
        'leaderboard_page:': handleLeaderboardPage,
    },
};
