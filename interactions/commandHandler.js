const { gameAutocomplete } = require('../utils/gameAutoComplete');

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {

        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'game_info' || interaction.commandName === 'announce_game') {
                await gameAutocomplete(interaction);
            }

            if (interaction.commandName === 'anon_msg') {
                const { getKeys } = require('../utils/anonStore');
                const focused = interaction.options.getFocused().toLowerCase();
                const choices = getKeys()
                    .filter(k => k.toLowerCase().includes(focused))
                    .slice(0, 25)
                    .map(k => ({ name: k, value: k }));
                await interaction.respond(choices);
                
            }

            if (interaction.commandName === 'schedule_activation') {
                const sub = interaction.options.getSubcommand();
                const { getCachedGames } = require('../utils/cache');
                const { getQueue } = require('../utils/activationQueue');
                const focused = interaction.options.getFocused().toLowerCase();
                const games = await getCachedGames();
            
                if (sub === 'add') {
                    const filtered = games
                        .filter(g => !g.activate && g.title.toLowerCase().includes(focused))
                        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
                        .slice(0, 25)
                        .map(g => ({ name: `${g.title.trim()} (${g.date})`, value: g.uid }));
                    await interaction.respond(filtered);
                    return;
                }
            
                if (sub === 'remove') {
                    const queue = getQueue().queue;
                    const filtered = queue
                        .filter(g => g.title.toLowerCase().includes(focused))
                        .slice(0, 25)
                        .map(g => ({ name: g.title, value: g.uid }));
                    await interaction.respond(filtered);
                    return;
                }
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

            if (command === 'list_games') {
                require('../commands/list_games')(interaction, client);
            }

            if (command === 'game_info') {
                require('../commands/game_info')(interaction, client);
            }

            if (command === 'rss') {
                require('../commands/rss')(interaction, client);
            }

            if (command === 'anon_msg') {
                require('../commands/anon_msg')(interaction, client);
            }

            if (command === 'schedule_activation') {
            	require('../commands/schedule_activation')(interaction, client);
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
