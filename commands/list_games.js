const { fetchGames } = require('../utils/notion');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandOptionWithAutocompleteMixin } = require('discord.js');
const { buildEmbed, formatGameLine} = require(`../utils/listGamesHelper`)

function applyFilters(games, { formatFilter, typeFilter, showAll }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered = games;

    if (!showAll) {
        filtered = filtered.filter(g => {
            if (!g.show) return false;
            if (!g.activate) return false;
            if (!g.rawDate) return false;
            const gameDate = new Date(g.rawDate);
            if (gameDate < today) return false;
            const seatsLeft = g.seats - g.taken;
            if (seatsLeft <= 0) return false;
            return true;
        });
    }

    if (formatFilter) {
        filtered = filtered.filter(g => g.format === formatFilter);
    }

    if (typeFilter) {
        filtered = filtered.filter(g => g.type === typeFilter);
    }

    return filtered;
}


function sortAndLimit(games, n) {
    const sorted = [...games].sort((a, b) => b.createdTime - a.createdTime);
    return n ? sorted.slice(0, n) : sorted;
}

module.exports = async (interaction, client) => {
    const formatFilter = interaction.options.getString('format_fitler')
    const typeFilter = interaction.options.getString('type_fitler')
    const showAll = interaction.options.getSBoolean('all') ?? false;
    const n = interaction.options.getInterger('n')
    const isPublic = interaction.options.getSBoolean('public') ?? false;

    await interaction.deferReply({ ephemeral: inPublic});

    try {
        const allGames = await fetchGames();
        const filtered = applyFilters(allGames, { formatFilter, typeFilter, showAll });
        const sorted = sortAndLimit(filtered, n);

        if (sorted.length === 0) {
            await interaction.editReply({ content: 'No games found matching your filters.'});
            return;;
        }

        const page = 0;
        const { embed, totalPages } = buildEmbed(sorted, page);

        const row =  new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`list_page_prev_${page}_${interaction.user.id}`)
                .setLabel('◀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`list_games_next_${page}_${interaction.user.id}`)
                .setLabel('▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(totalPages <= 1)
        );

        client.listGameSessions = client.listGamesSessions ?? new Map();
        client.listGamesSessions.set(interaction.user.id, { sorted, isPublic });

        await interaction.editReply({ embeds: [embed], components: [row] });
    } catch(error) {
        console.error('list_games error:', error);
        await interaction.editReply({ content: '❌ Failed to fetch games. Please try again.' });
    }
};