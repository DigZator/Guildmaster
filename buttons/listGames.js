const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildEmbed } = require('../utils/listGamesHelper');

function buildPaginationRow(page, totalPages, userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`list_games_prev_${page}_${userId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId(`list_games_next_${page}_${userId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );
}

module.exports = {

    prefix: {

        'list_games_next_': async (interaction, client) => {
            const parts = interaction.customId.split('_');
            const page   = parseInt(parts[3]) + 1;
            const userId = parts[4];

            const session = client.listGamesSessions?.get(userId);
            if (!session) return interaction.reply({ content: '❌ Session expired. Run the command again.', flags: 64 });

            const { embed, totalPages } = buildEmbed(session.sorted, page, session.isAdmin);
            await interaction.update({ embeds: [embed], components: [buildPaginationRow(page, totalPages, userId)] });
        },

        'list_games_prev_': async (interaction, client) => {
            const parts = interaction.customId.split('_');
            const page   = parseInt(parts[3]) - 1;
            const userId = parts[4];

            const session = client.listGamesSessions?.get(userId);
            if (!session) return interaction.reply({ content: '❌ Session expired. Run the command again.', flags: 64 });

            const { embed, totalPages } = buildEmbed(session.sorted, page, session.isAdmin);
            await interaction.update({ embeds: [embed], components: [buildPaginationRow(page, totalPages, userId)] });
        },
    }
};