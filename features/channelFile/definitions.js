const { SlashCommandBuilder, ChannelType } = require('discord.js');

// The slash command definition of the channel-file feature: /channel_file.
const definitions = [
	//channel_file (file: CMD role; protect add/remove/list: Admins role; both enforced by the router, see manifest.js)
	new SlashCommandBuilder()
		.setName('channel_file')
		.setDescription('Copy a channel (and its threads) into a thread, then delete the original after review')
		.addSubcommand(sub => sub
			.setName('file')
			.setDescription('File a channel into a thread, verify the copy, then delete the original once approved')
			.addChannelOption(opt => opt
				.setName('target')
				.setDescription('The channel or thread to file (and delete after review)')
				.setRequired(true)
				.addChannelTypes(
					ChannelType.GuildCategory,
					ChannelType.GuildText,
					ChannelType.GuildAnnouncement,
					ChannelType.GuildVoice,
					ChannelType.GuildStageVoice,
					ChannelType.GuildForum,
					ChannelType.GuildMedia,
					ChannelType.PublicThread,
					ChannelType.PrivateThread,
					ChannelType.AnnouncementThread,
				))
			.addChannelOption(opt => opt
				.setName('location')
				.setDescription('The text channel the filed thread is created in')
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText))
			.addBooleanOption(opt => opt
				.setName('private')
				.setDescription('Make the filed main thread private (true) or public (false)')
				.setRequired(true)))
		.addSubcommandGroup(group => group
			.setName('protect')
			.setDescription('Admin: manage channels that /channel_file can never file')
			.addSubcommand(sub => sub
				.setName('add')
				.setDescription('Protect a channel from being filed')
				.addChannelOption(opt => opt
					.setName('channel')
					.setDescription('The channel to protect')
					.setRequired(true)
					.addChannelTypes(
						ChannelType.GuildCategory,
						ChannelType.GuildText,
						ChannelType.GuildAnnouncement,
						ChannelType.GuildVoice,
						ChannelType.GuildStageVoice,
						ChannelType.GuildForum,
						ChannelType.GuildMedia,
						ChannelType.PublicThread,
						ChannelType.PrivateThread,
						ChannelType.AnnouncementThread,
					)))
			.addSubcommand(sub => sub
				.setName('remove')
				.setDescription('Remove a channel from the manual protect list')
				.addChannelOption(opt => opt
					.setName('channel')
					.setDescription('The channel to unprotect')
					.setRequired(true)))
			.addSubcommand(sub => sub
				.setName('list')
				.setDescription('Show the manually protected channels'))),
];

module.exports = { definitions };
