const { SlashCommandBuilder } = require('discord.js');

// The slash command definitions of the games feature, as far as it has moved (every games command). They are exported by
// command name because they are not registered side by side: deploy-commands.js spreads each one in at its own position,
// so the registered order never changes.

//list_games
const list_games = new SlashCommandBuilder()
	.setName('list_games')
	.setDescription('Browse upcoming games')
	.addBooleanOption(option => option
		.setName('browsing')
		.setDescription('Show all announced games including full and closed ones'))
	.addIntegerOption(option => option
		.setName('n')
		.setDescription('Limit the number of games shown')
		.setMinValue(1))
	.addStringOption(option => option
		.setName('format_filter')
		.setDescription('Filter games by format')
		.addChoices(
			{ name: 'Online', value: 'Online' },
			{ name: 'In-Person', value: 'In-Person' },
			{ name: 'Play-by-Post', value: 'Play-By-Post' },))
	.addStringOption(option => option
		.setName('type_filter')
		.setDescription('Filter games by type')
		.addChoices(
			{ name: 'One-Shots', value: 'One-Shot' },
			{ name: 'Mini-Adventures', value: 'Mini-Adventure' },
			{ name: 'Campaigns', value: 'Campaign' },
			{ name: 'Workshops', value: 'Workshop' },))
	.addBooleanOption(option => option
		.setName('public')
		.setDescription('Show results publicly in the channel (default: only you can see)'));

//get_players
const get_players = new SlashCommandBuilder()
    .setName('get_players')
    .setDescription('List players signed up for a table')
    .addStringOption(opt => opt
        .setName('game')
        .setDescription('Select a game/table')
        .setRequired(true)
        .setAutocomplete(true));

//game_info
const game_info = new SlashCommandBuilder()
	.setName('game_info')
	.setDescription('Get detailed info about a game')
	.addStringOption(opt => opt
		.setName('uid')
		.setDescription('Search for game by name')
		.setRequired(true)
		.setAutocomplete(true))
	.addBooleanOption(opt =>opt
		.setName('public')
		.setDescription('Show results public in channel (default: false)'));

//announce_game
const announce_game = new SlashCommandBuilder()
	.setName('announce_game')
	.setDescription('Announce a game to the quest board')
	.addStringOption(option => option
		.setName('game')
		.setDescription('Select a game to announce')
		.setRequired(true)
		.setAutocomplete(true));

//edit_game
const edit_game = new SlashCommandBuilder()
	.setName('edit_game')
	.setDescription('Edit a field on a game in Notion')
	.addStringOption(option => option
		.setName('game')
		.setDescription('Select a game to edit')
		.setRequired(true)
		.setAutocomplete(true))
	.addStringOption(opt => opt
		.setName('field')
		.setDescription('Select a field to edit')
		.setRequired(true)
		.setAutocomplete(true));

//create_campaign (Admin role only: enforced by the router)
const create_campaign = new SlashCommandBuilder()
	.setName('create_campaign')
	.setDescription('Create a campaign role, category, and text/voice channels')
	.addStringOption(option => option
		.setName('name')
		.setDescription('Campaign name, e.g. Lost Mines of Phandelver')
		.setMaxLength(92)
		.setRequired(true))
	.addUserOption(option => option
		.setName('dm')
		.setDescription('The DM: gets the DM role and the campaign role')
		.setRequired(true))
	.addBooleanOption(option => option
		.setName('spectators_read_chat')
		.setDescription('Can spectators (Adventurer role) read the text chat?')
		.setRequired(true))
	.addBooleanOption(option => option
		.setName('spectators_send_messages')
		.setDescription('Can spectators send messages in the text chat? (only applies if they can read it)')
		.setRequired(true))
	.addBooleanOption(option => option
		.setName('spectators_join_voice')
		.setDescription('Can spectators join the voice/stage channel?')
		.setRequired(true))
	.addBooleanOption(option => option
		.setName('spectators_send_voice_chat')
		.setDescription('Can spectators send messages in the voice/stage channel chat?')
		.setRequired(true))
	.addBooleanOption(option => option
		.setName('use_stage')
		.setDescription('Use a Stage channel instead of a Voice channel? (default: No)'))
	.addUserOption(option => option.setName('player_1').setDescription('Player 1: gets the campaign role'))
	.addUserOption(option => option.setName('player_2').setDescription('Player 2: gets the campaign role'))
	.addUserOption(option => option.setName('player_3').setDescription('Player 3: gets the campaign role'))
	.addUserOption(option => option.setName('player_4').setDescription('Player 4: gets the campaign role'))
	.addUserOption(option => option.setName('player_5').setDescription('Player 5: gets the campaign role'))
	.addUserOption(option => option.setName('player_6').setDescription('Player 6: gets the campaign role'));

//manipulate_table (scoped to the "Test" game only: see features/games/tableAdmin/data.js)
const manipulate_table = new SlashCommandBuilder()
    .setName('manipulate_table')
    .setDescription('Admin dashboard for managing seats on the Test game')
    .addStringOption(opt => opt
        .setName('game')
        .setDescription('Select a game/table (currently only "Test" is supported)')
        .setRequired(false)
        .setAutocomplete(true));

//schedule_activation
const schedule_activation = new SlashCommandBuilder()
	.setName('schedule_activation')
	.setDescription('Manage the game activation schedule')
	//add
	.addSubcommand(sub => sub
		.setName('add')
		.setDescription('Add a game to the activation queue')
		.addStringOption(opt => opt
			.setName('game')
			.setDescription('Select a game to queue for activation')
			.setRequired(true)
			.setAutocomplete(true)))
	//remove
	.addSubcommand(sub => sub
		.setName('remove')
		.setDescription('Remove a game from the activation queue')
		.addStringOption(opt => opt
			.setName('game')
			.setDescription('Select a game to remove from the queue')
			.setRequired(true)
			.setAutocomplete(true)))
	//view
	.addSubcommand(sub => sub
		.setName('view')
		.setDescription('View the current activation queue'))
	//set-reminder-time
	.addSubcommand(sub => sub
		.setName('set-reminder-time')
		.setDescription('Set the daily reminder time (IST, 24hr)')
		.addStringOption(opt => opt
			.setName('time')
			.setDescription('Time in HH:MM format e.g. 19:00')
			.setRequired(true)))
	//set-activation-time
	.addSubcommand(sub => sub
		.setName('set-activation-time')
		.setDescription('Set the activation time (IST, 24hr)')
		.addStringOption(opt => opt
			.setName('time')
			.setDescription('Time in HH:MM format e.g. 21:00')
			.setRequired(true)))
	//toggle-reminder
	.addSubcommand(sub => sub
		.setName('toggle-reminder')
		.setDescription('Enable or disable the daily reminder'))
	//toggle-auto
	.addSubcommand(sub => sub
		.setName('toggle-auto')
		.setDescription('Enable or disable auto-scheduling games on announcement'))
	//status
	.addSubcommand(sub => sub
		.setName('status')
		.setDescription('Show current schedule settings and queue'))
	//run-now
	.addSubcommand(sub => sub
		.setName('run-now')
		.setDescription('Force the activation job to run now for every queued game')
		.addBooleanOption(opt => opt
			.setName('announce')
			.setDescription('Post the announcement (WhatsApp copy + quest board)? Default: yes')
			.setRequired(false)));

module.exports = { definitions: { list_games, get_players, game_info, announce_game, edit_game, create_campaign, manipulate_table, schedule_activation } };
