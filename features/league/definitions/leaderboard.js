// The slash command definitions of /league leaderboard. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//leaderboard
const leaderboard = sub => sub
			.setName('leaderboard')
			.setDescription('View the character leaderboard')
			.addStringOption(opt => opt
				.setName('sort_by')
				.setDescription('What to sort by (default: level)')
				.addChoices(
					{ name: 'Level', value: 'level' },
					{ name: 'Gold', value: 'gold' },
					{ name: 'Reputation', value: 'reputation' },
					{ name: 'Milestones', value: 'milestones' },
				))
			.addStringOption(opt => opt
				.setName('order')
				.setDescription('Sort order (default: descending)')
				.addChoices(
					{ name: 'Descending', value: 'descending' },
					{ name: 'Ascending', value: 'ascending' },
				))
			.addStringOption(opt => opt
				.setName('class')
				.setDescription('Filter by class (partial match)'))
			.addStringOption(opt => opt
				.setName('species')
				.setDescription('Filter by species (partial match)'))
			.addStringOption(opt => opt
				.setName('status')
				.setDescription('Filter by status (e.g. Active, Passive, Retired)'))
			.addBooleanOption(opt => opt
				.setName('public')
				.setDescription('Show the result to everyone (default: only you)'));

module.exports = { leaderboard };
