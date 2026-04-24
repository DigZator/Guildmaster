function formatGameLine(game) {
    const formatEmoji = {
        'Online': '🌐',
        'In-Person': '📍',
        'Play-By-Post': '📝'
    };

    const seatsLeft = game.seats - game.taken;
    const emoji = formatEmoji[game.format] || '🎲';

    const lvl = game.level===0 ? "N/A" : game.level;

    return `**${game.title.trim()}**
${emoji} ${game.format} ${game.type} | ${game.system} | Lvl ${lvl} ${game.experienceLevel}
📅 ${game.date} | ${game.time}
💺 ${seatsLeft} seats left | \`${game.uid}\``;
}

function buildEmbed(games, page) {
    const pageSize = 10;
    const totalPages = Math.ceil(games.length / pageSize);
    const start = page * pageSize;
    const pageGames = games.slice(start, start + pageSize);

    const description = pageGames
        .map(formatGameLine)
        .join('\n\n─────────────────\n\n');

    const { EmbedBuilder } = require('discord.js');

    return {
        embed: new EmbedBuilder()
            .setTitle('📋 Game Listings')
            .setDescription(description || 'No games found.')
            .setFooter({ text: `Page ${page + 1} of ${totalPages} • ${games.length} games total` })
            .setColor(0x5865F2),
        totalPages
    };
}

module.exports = { formatGameLine, buildEmbed };