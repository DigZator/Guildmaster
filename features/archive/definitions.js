const { SlashCommandBuilder, ChannelType } = require('discord.js');

// The slash command definitions of the archive feature: /archive and /archive-config, in the order they are registered.
const definitions = [
	//archive
	new SlashCommandBuilder()
		.setName('archive')
		.setDescription('Archive a channel or category (locks it read-only and moves it into the configured archive category)')
		.addChannelOption(option => option
			.setName('target')
			.setDescription('The channel or category to archive')
			.setRequired(true)
			.addChannelTypes(
				ChannelType.GuildCategory,
				ChannelType.GuildText,
				ChannelType.GuildVoice,
				ChannelType.GuildStageVoice,
				ChannelType.GuildAnnouncement,
				ChannelType.GuildForum,
			)),

	//archive-config
	new SlashCommandBuilder()
		.setName('archive-config')
		.setDescription('Set which category /archive moves archived channels into')
		.addChannelOption(option => option
			.setName('category')
			.setDescription('The category to use as the archive destination')
			.setRequired(true)
			.addChannelTypes(ChannelType.GuildCategory)),
];

module.exports = { definitions };
