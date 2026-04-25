const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    throw new Error('Missing environment variables');
}

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),

    new SlashCommandBuilder()
        .setName('the_long_rest')
        .setDescription('Manage character memorials')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a character memorial'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a character memorial')
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('ID of the message to remove')
                        .setRequired(true)
                )
            ),

    new SlashCommandBuilder()
        .setName('announce_game')
        .setDescription('Announce a game to the quest board')
        .addStringOption(option =>
            option
                .setName('game')
                .setDescription('Select a game to announce')
                .setAutocomplete(true))
        .addBooleanOption(option =>
            option
                .setName('manual')
                .setDescription('Manually input announcement details instead of using game info')
        ),
    
    new SlashCommandBuilder()
        .setName('list_games')
        .setDescription('Browse upcoming games')
        .addBooleanOption(option =>
            option
                .setName('browsing')
                .setDescription('Show all announced games including full and closed ones')
            )
        .addIntegerOption(option =>
            option
                .setName('n')
                .setDescription('Limit the number of games shown')
                .setMinValue(1)
            )
        .addStringOption(option =>
            option
                .setName('format_filter')
                .setDescription('Filter games by format')
                .addChoices(
                    { name: 'Online', value: 'Online' },
                    { name: 'In-Person', value: 'In-Person' },
                    { name: 'Play-by-Post', value: 'Play-By-Post' },
                )
            )
        .addStringOption(option =>
            option
                .setName('type_filter')
                .setDescription('Filter games by type')
                .addChoices(
                    { name: 'One-Shots', value: 'One-Shot' },
                    { name: 'Mini-Adventures', value: 'Mini-Adventure' },
                    { name: 'Campaigns', value: 'Campaign' },
                    { name: 'Workshops', value: 'Workshop' },
                )
            )
        .addBooleanOption(option =>
            option
                .setName('public')
                .setDescription('Show results publicly in the channel (default: only you can see)')
            ),

    new SlashCommandBuilder()
        .setName('game_info')
        .setDescription('Get detailed info about a game')
        .addStringOption(option =>
            option
                .setName('uid')
                .setDescription('Search for game by name')
                .setRequired(true)
                .setAutocomplete(true))
        .addBooleanOption(option =>
            option
                .setName('public')
                .setDescription('Show results public in channel (default: false)'),
        )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Refreshing application (/) commands...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log('Commands successfully registered.');
    } catch (error) {
        console.error('Failed to register commands:', error?.rawError ?? error);
    }
})();
