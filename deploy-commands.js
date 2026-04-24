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
        .setDescription('Announce a new game!'),
    
    new SlashCommandBuilder()
        .setName('list_games')
        .setDescription('Browse upcoming games')
        .addStringOption(option =>
            option
                .setName('format_filter')
                .setDescription('Filter games by format')
                .addChoices(
                    { name: 'Online', value: 'Online' },
                    { name: 'In-Person', value: 'In-Person' },
                    { name: 'Play-by-Post', value: 'Play-by-Post' },
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
                )
            )
        .addBooleanOption(option =>
            option
                .setName('all')
                .setDescription('Show all games including full and past ones'))

        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Limit the number of games shown')
                .setMinValue(1)
            ),
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
