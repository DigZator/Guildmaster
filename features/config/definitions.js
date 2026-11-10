const { SlashCommandBuilder, ChannelType } = require('discord.js');

// The slash command definition of the config feature: /config, as it is registered.
const definitions = [
	//config (Admin role only: enforced by the router)
	new SlashCommandBuilder()
		.setName('config')
		.setDescription('Change where the bot sends things (applies after a restart)')
		.addSubcommand(sub => sub
			.setName('status')
			.setDescription('Show every channel mapping, its health, and any change waiting for a restart'))
		.addSubcommand(sub => sub
			.setName('set')
			.setDescription('Point a mapping at a different channel')
			.addStringOption(opt => opt
				.setName('key')
				.setDescription('Which mapping to change')
				.setRequired(true)
				.setAutocomplete(true))
			.addChannelOption(opt => opt
				.setName('channel')
				.setDescription('The new channel')
				.setRequired(true)
				.addChannelTypes(
					ChannelType.GuildText,
					ChannelType.GuildAnnouncement,
					ChannelType.GuildForum,
					ChannelType.PublicThread,
					ChannelType.PrivateThread,
					ChannelType.AnnouncementThread)))
		.addSubcommand(sub => sub
			.setName('clear')
			.setDescription('Remove a saved override so the .env value is used again')
			.addStringOption(opt => opt
				.setName('key')
				.setDescription('Which override to remove')
				.setRequired(true)
				.setAutocomplete(true))),
];

module.exports = { definitions };
