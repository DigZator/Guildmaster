const { SlashCommandBuilder } = require('discord.js');

// The slash command definitions of the games feature, as far as it has moved (the info and announcement commands). They are exported by
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

module.exports = { definitions: { list_games, get_players, game_info, announce_game, edit_game } };
