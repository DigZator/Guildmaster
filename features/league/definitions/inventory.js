// The slash command definitions of the inventory commands: inv and item. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//inv
const inv = sub => sub
			.setName('inv')
			.setDescription('View your inventory');

//item
const item = sub => sub
			.setName('item')
			.setDescription('View details of a specific item in your inventory')
			.addStringOption(opt => opt
				.setName('item')
				.setDescription('Find an item by name (autocomplete)')
				.setRequired(false)
				.setAutocomplete(true))
			.addIntegerOption(opt => opt
				.setName('id')
				.setDescription('The item number from your inventory list, e.g. 3 (precise, for double-checking)')
				.setRequired(false)
				.setMinValue(1))
			.addBooleanOption(opt => opt
				.setName('public')
				.setDescription('Show this to everyone in the channel? (default: private)')
				.setRequired(false));

module.exports = { inv, item };
