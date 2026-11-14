// The slash command definitions of /league gold and balance. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//gold
const gold = sub => sub
			.setName('gold')
			.setDescription('Transfer gold to another player')
			.addUserOption(opt => opt
				.setName('player')
				.setDescription('The player to send gold to')
				.setRequired(true))
			.addNumberOption(opt => opt
				.setName('amount')
				.setDescription('Amount of gold to transfer')
				.setRequired(true)
				.setMinValue(1));

//balance
const balance = sub => sub
			.setName('balance')
			.setDescription('Check your gold, reputation, and milestones');

module.exports = { gold, balance };
