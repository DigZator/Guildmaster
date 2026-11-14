// The slash command definitions of the /leagueadmin catalogue group. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//catalogue
const catalogueGroup = group => group
			.setName('catalogue')
			.setDescription('D&D item catalogue management')
			.addSubcommand(sub => sub
				.setName('sync')
				.setDescription('Refresh the item catalogue from Open5e (2024 SRD)'))
			.addSubcommand(sub => sub
				.setName('sync-spells')
				.setDescription('Refresh the spell list used by downtime scroll scribing'));

module.exports = { catalogueGroup };
