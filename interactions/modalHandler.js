module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isModalSubmit()) return;

        try {
            if (interaction.customId === 'characterSubmission_1') {
                require('../modals/characterSubmission_1')(interaction, client);
            }

            if (interaction.customId === 'characterSubmission_2') {
                require('../modals/characterSubmission_2')(interaction, client);
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