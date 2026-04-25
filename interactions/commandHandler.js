

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {

        if (interaction.isAutoComplete()) {
            if (interaction.commandName === 'list_game') {
                await require('../utils/gameAutoComplete')(interaction);
            } else if (interaction.commandName === 'announce_game') {
                await require('../utils/gameAutoComplete')(interaction);
            }
            return;
        }
        
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

            if (command === 'list_game') {
                require('../commands/list_games')(interaction, client);
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