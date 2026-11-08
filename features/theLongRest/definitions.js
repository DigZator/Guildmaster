const { SlashCommandBuilder } = require('discord.js');

// The slash command definition of the Long Rest feature: /the_long_rest.
const definitions = [
	//the_long_rest
	new SlashCommandBuilder()
		.setName('the_long_rest')
		.setDescription('Manage character memorials')
		//setup
		.addSubcommand(sub => sub
			.setName('setup')
			.setDescription('Post (or refresh) the The Long Rest button dashboard in this channel'))
		.addSubcommand(sub => sub
			.setName('reindex')
			.setDescription('Rebuild the memorial index by scanning the output channel (run once after adding this feature)'))
		.addSubcommand(subcommand => subcommand
			.setName('add')
			.setDescription('Add a character memorial'))
		.addSubcommand(subcommand => subcommand
			.setName('remove')
			.setDescription('Remove a character memorial')
			.addStringOption(opt => opt
				.setName('message_id')
				.setDescription('ID of the message to remove')
				.setRequired(true))),
];

module.exports = { definitions };
