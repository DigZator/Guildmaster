const { SlashCommandBuilder, ChannelType } = require('discord.js');

// The slash command definition of the verification feature: /verification.
const definitions = [
	//verification (the Admins role or the Discord Administrator permission; enforced by the router, see manifest.js)
	new SlashCommandBuilder()
		.setName('verification')
		.setDescription('Admin: manage member verification')
		.addSubcommand(sub => sub
			.setName('setup')
			.setDescription('Post (or repost) the verification dashboard')
			.addChannelOption(opt => opt
				.setName('channel')
				.setDescription('Dashboard channel (defaults to this channel)')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false))
			.addRoleOption(opt => opt
				.setName('role')
				.setDescription('Adventurer role (defaults to ADVENTURER_ROLE_ID)')
				.setRequired(false))
			.addChannelOption(opt => opt
				.setName('log_channel')
				.setDescription('Verification log channel (defaults to BOT_LOG_CHANNEL_ID)')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)))
		.addSubcommand(sub => sub
			.setName('settings')
			.setDescription('View or change timers, attempts and the unverified-member cleanup')
			.addIntegerOption(opt => opt.setName('question_time_limit').setDescription('Minutes a question stays valid (1-30)').setMinValue(1).setMaxValue(30).setRequired(false))
			.addIntegerOption(opt => opt.setName('lockout').setDescription('Minutes locked out after using every attempt (1-1440)').setMinValue(1).setMaxValue(1440).setRequired(false))
			.addIntegerOption(opt => opt.setName('max_attempts').setDescription('Attempts before a lockout (1-10)').setMinValue(1).setMaxValue(10).setRequired(false))
			.addIntegerOption(opt => opt.setName('deadline_days').setDescription('Days an unverified member has before cleanup (1-90)').setMinValue(1).setMaxValue(90).setRequired(false))
			.addStringOption(opt => opt.setName('reminder_days').setDescription('Days-left reminders, comma separated, e.g. 7,3,1').setRequired(false))
			.addStringOption(opt => opt.setName('cleanup_mode').setDescription('Kick members who never verify')
				.addChoices(
					{ name: 'Enabled (remind + kick)', value: 'enabled' },
					{ name: 'Dry run (log only, no DMs, no kicks)', value: 'dryrun' },
					{ name: 'Disabled (no checks at all)', value: 'disabled' },
				)
				.setRequired(false)))
		.addSubcommand(sub => sub
			.setName('force')
			.setDescription('Give a user the Adventurer role without the quiz (e.g. to verify a bot)')
			.addUserOption(opt => opt.setName('user').setDescription('Who to verify').setRequired(true)))
		.addSubcommand(sub => sub
			.setName('pending')
			.setDescription('List unverified members with their deadlines'))
		.addSubcommand(sub => sub
			.setName('extend')
			.setDescription('Give an unverified member extra days before cleanup')
			.addUserOption(opt => opt.setName('user').setDescription('Member to extend').setRequired(true))
			.addIntegerOption(opt => opt.setName('days').setDescription('Extra days (1-60)').setMinValue(1).setMaxValue(60).setRequired(true)))
		.addSubcommand(sub => sub
			.setName('status')
			.setDescription('Show verification config and counts')),
];

module.exports = { definitions };
