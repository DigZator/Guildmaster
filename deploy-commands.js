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
        .setDescription('Announce a new game!')
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
