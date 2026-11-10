const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { VALID_CATEGORY_GROUPS } = require('./ticketTypes');

const CATEGORY_GROUP_CHOICES = VALID_CATEGORY_GROUPS.map(g => ({ name: g, value: g }));

// The slash command definition of the tickets feature: /ticket.
const definitions = [
	//ticket
	new SlashCommandBuilder()
		.setName('ticket')
		.setDescription('Raise or close a support ticket, and manage the ticketing system')
		.addSubcommand(sub => sub
			.setName('raise')
			.setDescription('Open a support ticket — fill in what you can, a form asks for the rest')
			.addStringOption(opt => opt
				.setName('type')
				.setDescription('What kind of ticket is this?')
				.setRequired(true)
				.setAutocomplete(true))
			.addStringOption(opt => opt
				.setName('reason')
				.setDescription('Reason for raising the ticket')
				.setMaxLength(1000)
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('identification')
				.setDescription('Your name (and game name if relevant)')
				.setMaxLength(1000)
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('details')
				.setDescription('What do you need? Any extra info?')
				.setMaxLength(1000)
				.setRequired(false)))
		.addSubcommand(sub => sub
			.setName('close')
			.setDescription('Close the ticket you are in (run inside a ticket channel)')
			.addStringOption(opt => opt
				.setName('reason')
				.setDescription('Reason for closing — a form opens if you leave this blank')
				.setMaxLength(1000)
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('feedback')
				.setDescription('Additional feedback (optional)')
				.setMaxLength(1000)
				.setRequired(false)))
		.addSubcommand(sub => sub
			.setName('setup')
			.setDescription('Post or refresh the ticket dashboard in this channel')
			.addBooleanOption(option => option
				.setName('relocate')
				.setDescription('Move the dashboard here instead of refreshing it in its current channel')
				.setRequired(false)))
		.addSubcommand(sub => sub
			.setName('config')
			.setDescription('View or set the ticket category / log channel')
			.addChannelOption(opt => opt
				.setName('category')
				.setDescription('Category where normal ticket channels are created')
				.addChannelTypes(ChannelType.GuildCategory)
				.setRequired(false))
			.addChannelOption(opt => opt
				.setName('hr_category')
				.setDescription('Category where HR ticket channels are created')
				.addChannelTypes(ChannelType.GuildCategory)
				.setRequired(false))
			.addChannelOption(opt => opt
				.setName('log_channel')
				.setDescription('Channel where filed transcripts are posted as threads')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false))
			.addChannelOption(opt => opt
				.setName('hr_log_channel')
				.setDescription('Channel where filed HR ticket transcripts are posted as threads')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)))
		.addSubcommand(sub => sub
			.setName('reset_counter')
			.setDescription('Reset a ticket type\'s counter back to 000 (or all, if left blank)')
			.addStringOption(opt => opt
				.setName('type')
				.setDescription('Ticket type slug to reset (leave blank to reset all)')
				.setRequired(false)
				.setAutocomplete(true)))
		.addSubcommandGroup(group => group
			.setName('type')
			.setDescription('Manage ticket types shown on the dashboard')
			.addSubcommand(sub => sub
				.setName('add')
				.setDescription('Add a new ticket type')
				.addStringOption(opt => opt
					.setName('label')
					.setDescription('Shown on the dashboard button + embeds')
					.setRequired(true))
				.addStringOption(opt => opt
					.setName('key')
					.setDescription('Internal id (defaults to a slug of the label)')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('slug')
					.setDescription('Used in channel names, e.g. hr-000-janedoe (defaults to key)')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('emoji')
					.setDescription('Emoji shown on the dashboard button')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('channel_tag')
					.setDescription('Short tag used in the channel name (defaults to slug)')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('modal_title')
					.setDescription('Override title for the creation modal (defaults to label)')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('category_group')
					.setDescription('Which ticket category this type is created under')
					.setRequired(false)
					.addChoices(...CATEGORY_GROUP_CHOICES))
				.addRoleOption(opt => opt
					.setName('viewer_role')
					.setDescription('Role referenced for this ticket type')
					.setRequired(false))
				.addRoleOption(opt => opt
					.setName('ping_target_role')
					.setDescription('Role pinged on ticket creation')
					.setRequired(false)))
			.addSubcommand(sub => sub
				.setName('edit')
				.setDescription('Edit an existing ticket type')
				.addStringOption(opt => opt
					.setName('key')
					.setDescription('Ticket type to edit')
					.setRequired(true)
					.setAutocomplete(true))
				.addStringOption(opt => opt
					.setName('label')
					.setDescription('Shown on the dashboard button + embeds')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('slug')
					.setDescription('Used in channel names')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('emoji')
					.setDescription('Emoji shown on the dashboard button')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('channel_tag')
					.setDescription('Short tag used in the channel name')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('modal_title')
					.setDescription('Override title for the creation modal')
					.setRequired(false))
				.addStringOption(opt => opt
					.setName('category_group')
					.setDescription('Which ticket category this type is created under')
					.setRequired(false)
					.addChoices(...CATEGORY_GROUP_CHOICES))
				.addRoleOption(opt => opt
					.setName('viewer_role')
					.setDescription('Role referenced for this ticket type')
					.setRequired(false))
				.addRoleOption(opt => opt
					.setName('ping_target_role')
					.setDescription('Role pinged on ticket creation')
					.setRequired(false)))
			.addSubcommand(sub => sub
				.setName('remove')
				.setDescription('Remove a ticket type (existing tickets of this type are unaffected)')
				.addStringOption(opt => opt
					.setName('key')
					.setDescription('Ticket type to remove')
					.setRequired(true)
					.setAutocomplete(true)))
			.addSubcommand(sub => sub
				.setName('list')
				.setDescription('List all configured ticket types'))),
];

module.exports = { definitions };
