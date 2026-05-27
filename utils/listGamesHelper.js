const { EmbedBuilder } = require('discord.js');

function formatGameLine(game, isAdmin) {
    const hidden = isAdmin && !game.show ? '[HIDDEN] ' : '';
    const seatsLeft = game.openSeats !== undefined ? game.openSeats : 'N/A';
    const lock = !game.activate ? ' 🔒' : '';
    const level = game.level === '0' ? 'N/A' : game.level;
    const levelinfo = game.type === 'Workshop' ? `` :  `📊 Lvl ${level} ${game.experienceLevel}`;

    return `${hidden}🎲 **${game.title.trim()}**\n` +
        `🌐 ${game.format} ${game.type} | ⚔️ ${game.system} | ${levelinfo}\n` +
        `📅 ${game.date} | 💺 ${seatsLeft} seats left`;
}

function buildEmbed(games, page, isAdmin) {
    const pageSize = 10;
    const totalPages = Math.ceil(games.length / pageSize);
    const start = page * pageSize;
    const pageGames = games.slice(start, start + pageSize);

    const description = pageGames
        .map(g => formatGameLine(g, isAdmin))
        .join('\n\n');

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
