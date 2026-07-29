module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isModalSubmit()) return;
        try {
            if (interaction.customId === 'characterSubmission_1') {
                await require('../modals/characterSubmission_1')(interaction, client);
            }
            if (interaction.customId === 'characterSubmission_2') {
                await require('../modals/characterSubmission_2')(interaction, client);
            }
            if (interaction.customId === 'leagueCreate') {
                const { handleLeagueCreate } = require('./leagueCreateModal');
                await handleLeagueCreate(interaction, client);
            }
            if (interaction.customId.startsWith('editgame_modal_')) {
                await require('../modals/editGameModal')(interaction, client);
            }
            if (interaction.customId.startsWith('announceedit_modal_')) {
                await require('../modals/announceEditModal')(interaction, client);
            }
        } catch (error) {
            console.error('Error handling modal:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error processing your submission!',
                    flags: 64
                });
            }
        }
    });
};
