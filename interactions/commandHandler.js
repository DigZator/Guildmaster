module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (!interaction.guild) return;

        const command = interaction.commandName;

        try {
            if (command === 'ping') {
                require('../commands/ping')(interaction);
            }

            if (command === 'the_long_rest') {
                require('../commands/the_long_rest')(interaction, client);
            }

            if (command === 'announce_game') {
                require('../commands/announce_game')(interaction, client);
            }

        } catch (error) {
            console.error('Error handling interaction:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    flags: 64
                });
            }
        }
    });
};