const { EmbedBuilder } = require('discord.js');
const { can } = require('../../shared/auth');

// Who sees the games that are not released yet (and the [HIDDEN] marker): the Admins role only. Being in the
// control channel is not enough (a deliberate change, plan item 10; it used to be the Admins role OR that channel).
function canSeeUnreleased(interaction) {
    return can('admin', interaction);
}

function applyFilters(games, { formatFilter, typeFilter, browsing, isAdmin }) {
    let filtered = [...games];

    if (!isAdmin) {
        filtered = filtered.filter(g => g.show);
    }

    if (!browsing) {
        filtered = filtered.filter(g => g.activate);
        filtered = filtered.filter(g => g.openSeats > 0);
    }

    if (formatFilter) {
        filtered = filtered.filter(g => g.format === formatFilter);
    }

    if (typeFilter) {
        filtered = filtered.filter(g => g.type === typeFilter);
    }

    filtered.sort((a, b) => b.createdTime - a.createdTime);

    return filtered;
}


function formatGameLine(game, isAdmin) {
    const hidden = isAdmin && !game.show ? '[HIDDEN] ' : '';
    const seatsLeft = game.openSeats !== undefined ? game.openSeats : 'N/A';
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

module.exports = { buildEmbed, applyFilters, canSeeUnreleased };
