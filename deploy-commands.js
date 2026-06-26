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
                .setDescription('Show results public in channel (default: false)')
        ),

    new SlashCommandBuilder()
        .setName('rss')
        .setDescription('Manage RSS feeds')
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Add a new RSS feed')
            .addStringOption(opt => opt
                .setName('url')
                .setDescription('The RSS feed URL')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('Display name for the feed')
                .setRequired(true))
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel to post to (defaults to #feeds)')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Remove an RSS feed')
            .addStringOption(opt => opt
                .setName('query')
                .setDescription('Feed name or URL to remove')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List all RSS feeds')),

    new SlashCommandBuilder()
        .setName('anon_msg')
        .setDescription('Manage anonymous messages')
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Send a new anonymous message')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel to post in')
                .setRequired(true))
            .addStringOption(opt => opt
                .setName('key')
                .setDescription('Unique key to identify this message (required for edit)')
                .setRequired(false))
            .addStringOption(opt => opt
                .setName('content')
                .setDescription('Message content (single line)')
                .setRequired(false))
            .addBooleanOption(opt => opt
                .setName('multiline')
                .setDescription('Provide content interactively in triple backticks')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('rmv')
            .setDescription('Remove an anonymous message')
            .addStringOption(opt => opt
                .setName('key')
                .setDescription('Key of the message to remove')
                .setRequired(true)
                .setAutocomplete(true)))
        .addSubcommand(sub => sub
            .setName('edit')
            .setDescription('Edit an anonymous message')
            .addStringOption(opt => opt
                .setName('key')
                .setDescription('Key of the message to edit')
                .setRequired(true)
                .setAutocomplete(true))),

        new SlashCommandBuilder()
            .setName('schedule_activation')
            .setDescription('Manage the game activation schedule')
            .addSubcommand(sub => sub
                .setName('add')
                .setDescription('Add a game to the activation queue')
                .addStringOption(opt => opt
                    .setName('game')
                    .setDescription('Select a game to queue for activation')
                    .setRequired(true)
                    .setAutocomplete(true)))
            .addSubcommand(sub => sub
                .setName('remove')
                .setDescription('Remove a game from the activation queue')
                .addStringOption(opt => opt
                    .setName('game')
                    .setDescription('Select a game to remove from the queue')
                    .setRequired(true)
                    .setAutocomplete(true)))
            .addSubcommand(sub => sub
                .setName('view')
                .setDescription('View the current activation queue'))
            .addSubcommand(sub => sub
                .setName('set-reminder-time')
                .setDescription('Set the daily reminder time (IST, 24hr)')
                .addStringOption(opt => opt
                    .setName('time')
                    .setDescription('Time in HH:MM format e.g. 19:00')
                    .setRequired(true)))
            .addSubcommand(sub => sub
                .setName('set-activation-time')
                .setDescription('Set the activation time (IST, 24hr)')
                .addStringOption(opt => opt
                    .setName('time')
                    .setDescription('Time in HH:MM format e.g. 21:00')
                    .setRequired(true)))
            .addSubcommand(sub => sub
                .setName('toggle-reminder')
                .setDescription('Enable or disable the daily reminder'))
            .addSubcommand(sub => sub
            	.setName('toggle-auto')
            	.setDescription('Enable or disable auto-scheduling games on announcement'))
            .addSubcommand(sub => sub
                .setName('status')
                .setDescription('Show current schedule settings and queue')),

        new SlashCommandBuilder()
        	.setName('help')
        	.setDescription('Show all Guildmaster commands'),
        
        new SlashCommandBuilder()
            .setName('edit_game')
            .setDescription('Edit a field on a game in Notion')
            .addStringOption(option =>
                option
                    .setName('game')
                    .setDescription('Select a game to edit')
                    .setRequired(true)
                    .setAutocomplete(true))
            .addStringOption(option =>
                option
                    .setName('field')
                    .setDescription('Select a field to edit')
                    .setRequired(true)
                    .setAutocomplete(true)),

        new SlashCommandBuilder()
		    .setName('league')
		    .setDescription("Adventurer's Guild League Commands")
		    .addSubcommand(sub =>
		        sub.setName('create')
		            .setDescription('Register your character in the Adventurer\'s Guild League'))
		    .addSubcommand(sub =>
		        sub.setName('profile')
		            .setDescription('View your character profile')
		            .addUserOption(opt => opt
		                .setName('user')
		                .setDescription('View another player\'s character profile')
		                .setRequired(false)))
		    .addSubcommand(sub =>
		    	sub.setName('edit')
		    		.setDescription('Edit your character details')
		    		.addStringOption(opt => opt
		    			.setName('name')
		    			.setDescription('Update your character\'s name')
		    			.setRequired(false))
  		    		.addStringOption(opt => opt
  		    			.setName('class')
  		    			.setDescription('Update your character\'s class (e.g. Bladesinger Wizard)')
  		    			.setRequired(false))
 		    		.addStringOption(opt => opt
 		    			.setName('background')
 		    			.setDescription('Update your character\'s background')
 		    			.setRequired(false))
 		    		.addStringOption(opt => opt
 		    			.setName('charsheet')
 		    			.setDescription('Update your character sheet link')
 		    			.setRequired(false)))
		    .addSubcommand(sub =>
		    	sub.setName('setart')
		    		.setDescription('Set your character profile art')
		    		.addAttachmentOption(opt => opt
		    			.setName('image')
		    			.setDescription('Your character art (no AI-generated images)')
		    			.setRequired(true)))
		    .addSubcommand(sub =>
		        sub.setName('inv')
		            .setDescription('View your inventory'))
		    .addSubcommand(sub =>
		        sub.setName('item')
		            .setDescription('View details of a specific item in your inventory')
		            .addIntegerOption(opt => opt
		                .setName('id')
		                .setDescription('The item number from your inventory list (e.g. 3)')
		                .setRequired(true)
		                .setMinValue(1))
		            .addBooleanOption(opt => opt
		                .setName('public')
		                .setDescription('Show this to everyone in the channel? (default: private)')
		                .setRequired(false)))
		    .addSubcommand(sub =>
		        sub.setName('shop')
		            .setDescription('Browse the guild shop'))
		    .addSubcommand(sub =>
		        sub.setName('marketplace')
		            .setDescription('Browse the player marketplace'))
		    .addSubcommand(sub =>
		        sub.setName('log')
		            .setDescription('View your quest log')),
        
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
        console.error('Failed to register commands:', JSON.stringify(error?.rawError ?? error, null, 2));
    }
})();
