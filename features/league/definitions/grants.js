// The slash command definitions of the /leagueadmin grant, approval, item and audit commands. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.
const { ITEM_TYPE_CHOICES, ITEM_SUBTYPE_CHOICES, ITEM_RARITY_CHOICES } = require('../../../config/itemChoices');

//rep
const rep = sub => sub
			.setName('rep')
			.setDescription('Grant reputation to a character')
			.addUserOption(opt => opt.setName('user').setDescription('Target player').setRequired(true))
			.addIntegerOption(opt => opt.setName('amount').setDescription('Amount (max 2)').setRequired(true));

//gold
const adminGold = sub => sub
			.setName('gold')
			.setDescription('Grant gold to a character')
			.addUserOption(opt => opt.setName('user').setDescription('Target player').setRequired(true))
			.addNumberOption(opt => opt.setName('amount').setDescription('Amount in gp (admin can use negative)').setRequired(true));

//milestone
const milestone = sub => sub
			.setName('milestone')
			.setDescription('Grant milestones to a character')
			.addUserOption(opt => opt.setName('user').setDescription('Target player').setRequired(true))
			.addIntegerOption(opt => opt.setName('amount').setDescription('Number of milestones').setRequired(true));

//pending
const pending = sub => sub
			.setName('pending')
			.setDescription('List all pending DM grant actions');

//approve
const approve = sub => sub
			.setName('approve')
			.setDescription('Approve a pending DM grant action')
			.addStringOption(opt => opt.setName('id').setDescription('Action ID (comma separated - "34, 756")').setRequired(true));

//reject
const reject = sub => sub
			.setName('reject')
			.setDescription('Reject a pending DM grant action')
			.addStringOption(opt => opt.setName('id').setDescription('Action ID (comma separated - "34, 756")').setRequired(true))
			.addStringOption(opt => opt.setName('reason').setDescription('Reason (required for quest-report rejections)').setRequired(false))
			.addStringOption(opt => opt.setName('line').setDescription('Line ID — reject only one line of a quest-report, leaving the rest pending (single id only)').setRequired(false));

//clear
const clear = sub => sub
			.setName('clear')
			.setDescription('⚠️ Force-remove a stuck pending action WITHOUT approve/reject logic. Use only if it already applied.')
			.addStringOption(opt => opt.setName('id').setDescription('Action ID (comma separated - "34, 756")').setRequired(true));

const itemGroup = group => group
			.setName('item')
			.setDescription('Item management')
			.addSubcommand(sub => sub
				.setName('create')
				.setDescription('Create a new inventory item')
				.addStringOption(opt => opt.setName('name').setDescription('Item name').setRequired(true))
				.addStringOption(opt => opt.setName('type').setDescription('Item type').setRequired(true)
					.addChoices(...ITEM_TYPE_CHOICES)
				)
				.addStringOption(opt => opt.setName('rarity').setDescription('Rarity').setRequired(true)
					.addChoices(...ITEM_RARITY_CHOICES)
				)
				.addStringOption(opt => opt.setName('subtype').setDescription('Subtype').setRequired(false)
					.addChoices(...ITEM_SUBTYPE_CHOICES)
				)
				.addUserOption(opt => opt.setName('player').setDescription('Assign to a player (optional for admin, required for DM)').setRequired(false))
				.addStringOption(opt => opt.setName('source').setDescription('How the item was obtained').setRequired(false)
					.addChoices(
						{ name: 'Quest Reward',  value: 'Quest Reward' },
						{ name: 'Shop Purchase', value: 'Shop Purchase' },
						{ name: 'Event',         value: 'Event' },
						{ name: 'Admin Grant',   value: 'Admin Grant' },
					)
				)
				.addIntegerOption(opt => opt.setName('value').setDescription('Item value in gp').setRequired(false).setMinValue(0))
				.addStringOption(opt => opt.setName('notes').setDescription('Additional notes').setRequired(false)))
			.addSubcommand(sub => sub
				.setName('import')
				.setDescription('Import an item directly from the 5e catalogue')
				.addStringOption(opt => opt.setName('code').setDescription('Catalogue item code (see /league shop search)').setRequired(true).setAutocomplete(true))
				.addUserOption(opt => opt.setName('player').setDescription('Assign to a player (optional)').setRequired(false))
				.addIntegerOption(opt => opt.setName('value').setDescription('Override the catalogue price (gp)').setRequired(false).setMinValue(0))
				.addStringOption(opt => opt.setName('source').setDescription('How the item was obtained').setRequired(false)
					.addChoices(
						{ name: 'Quest Reward',  value: 'Quest Reward' },
						{ name: 'Shop Purchase', value: 'Shop Purchase' },
						{ name: 'Event',         value: 'Event' },
						{ name: 'Admin Grant',   value: 'Admin Grant' },
					)
				)
				.addStringOption(opt => opt.setName('notes').setDescription('Override the catalogue description').setRequired(false)));

//audit
const auditGroup = group => group
		    .setName('audit')
		    .setDescription('Data-integrity checks')
		    .addSubcommand(sub => sub
		        .setName('characters')
		        .setDescription('Check for players with more than one Active character'));

module.exports = { rep, adminGold, milestone, pending, approve, reject, clear, itemGroup, auditGroup };
