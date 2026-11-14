// The slash command definitions of /league dashboard. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//dashboard
const dashboard = sub => sub
			.setName('dashboard')
			.setDescription('Get a personal button dashboard for your character (profile, quests, downtimes, etc.)');

module.exports = { dashboard };
