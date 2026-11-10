const { SlashCommandBuilder } = require('discord.js');

// The slash command definitions of the general feature. They are exported by command name because they are not
// registered side by side: deploy-commands.js spreads each one in at its own position, so the registered order never changes.

//ping
const ping = new SlashCommandBuilder()
	.setName('ping')
	.setDescription('Replies with Pong!');

//keep_alive
const keep_alive = new SlashCommandBuilder()
	.setName('keep_alive')
	.setDescription('Toggle Keep Alive on this thread so it is never archived for inactivity');

//help
const help = new SlashCommandBuilder()
	.setName('help')
	.setDescription('Show Guildmaster commands, organized by section')
	.addStringOption(opt => opt.setName('group').setDescription('Which command group to see help for').setRequired(true)
		.addChoices(
			{ name: 'Help (about the help command)', value: 'help' },
			{ name: 'Player',        value: 'player' },
			{ name: 'Admin',         value: 'admin' },
			{ name: 'League',        value: 'league' },
			{ name: 'League DM',     value: 'leaguedm' },
			{ name: 'League Admin',  value: 'leagueadmin' },
		)
	)
	.addStringOption(opt => opt.setName('family').setDescription('Which section within that group').setRequired(true).setAutocomplete(true));

module.exports = { definitions: { ping, keep_alive, help } };
