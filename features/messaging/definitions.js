const { SlashCommandBuilder } = require('discord.js');

// The slash command definitions of the messaging feature: /rss and /anon_msg, in the order they are registered.
const definitions = [
	//rss
	new SlashCommandBuilder()
		.setName('rss')
		.setDescription('Manage RSS feeds')
		//add
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
		//remove
		.addSubcommand(sub => sub
			.setName('remove')
			.setDescription('Remove an RSS feed')
			.addStringOption(opt => opt
				.setName('query')
				.setDescription('Feed name or URL to remove')
				.setRequired(true)))
		//list
		.addSubcommand(sub => sub
			.setName('list')
			.setDescription('List all RSS feeds')),

	//anon_msg
	new SlashCommandBuilder()
		.setName('anon_msg')
		.setDescription('Manage anonymous messages')
		//add
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
				.setMaxLength(80) // keeps the button custom IDs under Discord's 100-character limit
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('content')
				.setDescription('Message content (single line)')
				.setRequired(false))
			.addBooleanOption(opt => opt
				.setName('multiline')
				.setDescription('Provide content interactively in triple backticks (also lets you attach up to 10 files)')
				.setRequired(false))
			.addAttachmentOption(opt => opt
				.setName('attachment')
				.setDescription('A file or image to post with the message (use multiline to attach several)')
				.setRequired(false))
			.addBooleanOption(opt => opt
				.setName('mentions')
				.setDescription('Let @users, @roles and @everyone in the message actually ping (default: off)')
				.setRequired(false)))
		//rmv
		.addSubcommand(sub => sub
			.setName('rmv')
			.setDescription('Remove an anonymous message')
				.addStringOption(opt => opt
					.setName('key')
					.setDescription('Key of the message to remove')
					.setRequired(true)
					.setAutocomplete(true)))
		//edit
		.addSubcommand(sub => sub
			.setName('edit')
			.setDescription('Edit an anonymous message')
		.addStringOption(opt => opt
			.setName('key')
			.setDescription('Key of the message to edit')
			.setRequired(true)
			.setAutocomplete(true))
		.addBooleanOption(opt => opt
			.setName('mentions')
			.setDescription('Let @users, @roles and @everyone in the new text actually ping (default: off)')
			.setRequired(false))),
];

module.exports = { definitions };
