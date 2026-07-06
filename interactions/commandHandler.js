const { gameAutocomplete } = require('../utils/gameAutoComplete');
const { getKeys } = require('../utils/anonStore');
const { getCachedGames } = require('../utils/cache');
const { getQueue } = require('../utils/activationQueue');
const gameFields = require('../data/gameFields.json');
const ping = require('../commands/ping');
const the_long_rest = require('../commands/the_long_rest');
const announce_game = require('../commands/announce_game');
const list_games = require('../commands/list_games');
const game_info = require('../commands/game_info');
const rss = require('../commands/rss');
const anon_msg = require('../commands/anon_msg');
const schedule_activation = require('../commands/schedule_activation');
const help = require('../commands/help');
const edit_game = require('../commands/edit_game');
const { league } = require('../commands/league');
const { leagueAdmin, leagueDM } = require('../commands/leagueGrants');
const { questLinkAutocomplete } = require('../commands/leagueQuest');

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {

        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'game_info' || interaction.commandName === 'announce_game') {
                await gameAutocomplete(interaction);
            }

            if (interaction.commandName === 'anon_msg') {
                const focused = interaction.options.getFocused().toLowerCase();
                const choices = getKeys()
                    .filter(k => k.toLowerCase().includes(focused))
                    .slice(0, 25)
                    .map(k => ({ name: k, value: k }));
                await interaction.respond(choices);
            }

            if (interaction.commandName === 'schedule_activation') {
                const sub = interaction.options.getSubcommand();
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

            if (interaction.commandName === 'edit_game') {
                const focused = interaction.options.getFocused(true);

                if (focused.name === 'game') {
                    await gameAutocomplete(interaction);
                    return;
                }

                if (focused.name === 'field') {
                    const query = focused.value.toLowerCase();
                    const choices = Object.keys(gameFields)
                        .filter(f => f.toLowerCase().includes(query))
                        .slice(0, 25)
                        .map(f => ({ name: f, value: f }));
                    await interaction.respond(choices);
                    return;
                }
            }

            if (interaction.commandName === 'leaguedm') {
                const group   = interaction.options.getSubcommandGroup(false);
                const sub     = interaction.options.getSubcommand();

                if (group === 'quest' && sub === 'link') {
                    await questLinkAutocomplete(interaction);
                    return;
                }
            }            
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        if (!interaction.guild) return;

        const command = interaction.commandName;

        try {
            if (command === 'ping') ping(interaction);
            if (command === 'the_long_rest') the_long_rest(interaction, client);
            if (command === 'announce_game') announce_game(interaction, client);
            if (command === 'list_games') list_games(interaction, client);
            if (command === 'game_info') game_info(interaction, client);
            if (command === 'rss') rss(interaction, client);
            if (command === 'anon_msg') anon_msg(interaction, client);
            if (command === 'schedule_activation') schedule_activation(interaction, client);
            if (command === 'help') help(interaction);
            if (command === 'edit_game') edit_game(interaction, client);
            if (command === 'league') league(interaction, client);
            if (command === 'leagueadmin') leagueAdmin(interaction, client);
            if (command === 'leaguedm') leagueDM(interaction, client);
        } catch (error) {
            console.error('Error handling interaction:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    flags: 64
                });
            } else {
                await interaction.followUp({
                    content: 'There was an error while executing this command!',
                    flags: 64
                });
            }
        }
    });
};
