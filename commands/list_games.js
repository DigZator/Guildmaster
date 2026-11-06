const { getCachedGames } = require('../utils/cache');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildEmbed, applyFilters, canSeeUnreleased } = require('../utils/listGamesHelper');

module.exports = async (interaction, client) => {
    const formatFilter = interaction.options.getString('format_filter');
    const typeFilter = interaction.options.getString('type_filter');
    const browsing = interaction.options.getBoolean('browsing') ?? false;
    const n = interaction.options.getInteger('n');
    const isPublic = interaction.options.getBoolean('public') ?? true;
    const isAdmin = canSeeUnreleased(interaction);

    await interaction.deferReply({ flags: isPublic ? 0 : 64 });

    try {
        const allGames = await getCachedGames();
        let filtered = applyFilters(allGames, { formatFilter, typeFilter, browsing, isAdmin });

        if (n) filtered = filtered.slice(0, n);

        if (filtered.length === 0) {
            await interaction.editReply({ content: 'No games found matching your filters.' });
            return;
        }

        const page = 0;
        const { embed, totalPages } = buildEmbed(filtered, page, isAdmin);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`list_games_prev_${page}_${interaction.user.id}`)
                .setLabel('◀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`list_games_next_${page}_${interaction.user.id}`)
                .setLabel('▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(totalPages <= 1)
        );

        client.listGamesSessions = client.listGamesSessions ?? new Map();
        client.listGamesSessions.set(interaction.user.id, { sorted: filtered, isPublic, isAdmin });

        await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error('list_games error:', error);
        await interaction.editReply({ content: '❌ Failed to fetch games. Please try again.' });
    }
};
