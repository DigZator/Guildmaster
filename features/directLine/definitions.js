const { SlashCommandBuilder } = require('discord.js');

// The slash command definition of the direct-line feature: /direct_line.
const definitions = [
	//direct_line
	new SlashCommandBuilder()
		.setName('direct_line')
		.setDescription('HR-only: open and manage a private direct line of communication with one or more members')
		.addSubcommand(sub => sub
			.setName('create')
			.setDescription('Open a new direct line channel with one to four targets')
			.addUserOption(option => option
				.setName('target')
				.setDescription('The primary person this direct line is with')
				.setRequired(true))
			.addUserOption(option => option
				.setName('target2')
				.setDescription('Additional target (optional)')
				.setRequired(false))
			.addUserOption(option => option
				.setName('target3')
				.setDescription('Additional target (optional)')
				.setRequired(false))
			.addUserOption(option => option
				.setName('target4')
				.setDescription('Additional target (optional)')
				.setRequired(false)))
		.addSubcommand(sub => sub
			.setName('attach')
			.setDescription('Run inside a direct line channel: add or remove people\'s access to it')
			.addUserOption(option => option
				.setName('target')
				.setDescription('Person to add or remove')
				.setRequired(true))
			.addBooleanOption(option => option
				.setName('remove')
				.setDescription('Set true to remove the target(s) instead of adding them')
				.setRequired(true))
			.addUserOption(option => option
				.setName('target2')
				.setDescription('Additional target (optional)')
				.setRequired(false))
			.addUserOption(option => option
				.setName('target3')
				.setDescription('Additional target (optional)')
				.setRequired(false))
			.addUserOption(option => option
				.setName('target4')
				.setDescription('Additional target (optional)')
				.setRequired(false)))
		.addSubcommand(sub => sub
			.setName('file')
			.setDescription('Run inside a direct line channel: log the transcript to HR and delete the channel')),
];

module.exports = { definitions };
