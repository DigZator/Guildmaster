// The slash command definitions of the /league downtime group. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//downtime
const downtimeGroup = group => group
		    .setName('downtime')
		    .setDescription('Downtime activities')
		    .addSubcommand(sub => sub
	            .setName('start')
	            .setDescription('Begin a downtime activity')
	            .addStringOption(opt => opt.setName('activity').setDescription('Activity to perform — start typing to search').setRequired(true).setAutocomplete(true))
	            .addStringOption(opt => opt.setName('tier').setDescription('Rarity / spell level / tool / etc. — only needed if the activity above has options').setRequired(false).setAutocomplete(true))
	            .addStringOption(opt => opt.setName('spell').setDescription('Spell to scribe (required for Scribe a Spell Scroll)').setRequired(false).setAutocomplete(true))
	            .addStringOption(opt => opt.setName('item').setDescription('Magic item to craft (required for Craft a Magic Item)').setRequired(false).setAutocomplete(true))
	            .addIntegerOption(opt => opt.setName('quantity').setDescription('How many to craft (crafting activities only, default 1)').setRequired(false).setMinValue(1)))
		    .addSubcommand(sub => sub
		        .setName('progress')
		        .setDescription('Invest days into an active downtime activity')
		        .addStringOption(opt => opt.setName('id').setDescription('DTA ID').setRequired(true))
		        .addIntegerOption(opt => opt.setName('days').setDescription('Days to invest').setRequired(true).setMinValue(1)))
		    .addSubcommand(sub => sub
		        .setName('list')
		        .setDescription('View your active downtime activities'))
		    .addSubcommand(sub => sub
		        .setName('buy-days')
		        .setDescription('Spend 1 reputation point for 10 more downtime days'))
		    .addSubcommand(sub => sub
		        .setName('activities')
		        .setDescription('Browse all downtime activities, their tiers, costs, and approval requirements'));

module.exports = { downtimeGroup };
