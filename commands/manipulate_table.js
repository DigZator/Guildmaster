// STATUS: NOT WIRED IN.
// To activate later:
//   1. Uncomment the SlashCommandBuilder block in deploy-commands.js
//      (kept there as a commented-out block — see that file).
//   2. In interactions/commandHandler.js, add:
//        const manipulate_table = require('../commands/manipulate_table');
//        ...and a dispatch branch: if (interaction.commandName === 'manipulate_table') return manipulate_table(interaction);
//   3. In interactions/buttonHandler.js, add tableAdmin's prefix export
//      (see buttons/tableAdmin.js header for the exact snippet).
//   4. Re-run node deploy-commands.js to register the command with Discord.
//
// SCOPE LOCK: only operates on the "Test" game (see utils/tableAdminData.js).

const { isAdminChannel } = require('../utils/isAdminChannel');
const { getTestGame } = require('../utils/tableAdminData');
const { renderDashboard } = require('../interactions/tableAdminDashboardRender');

module.exports = async (interaction) => {
	if (!isAdminChannel(interaction, 'botAdmin')) {
		await interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
		return;
	}

	const gameUID = interaction.options.getString('game');

	await interaction.deferReply({ flags: 64 });

	let game;
	try {
		// getTestGame() enforces the "Test"-only scope lock and throws if the
		// selected game (or the fallback lookup) doesn't resolve to it.
		game = await getTestGame(gameUID || undefined);
	} catch (err) {
		console.error('manipulate_table scope error:', err.message);
		await interaction.editReply({ content: `❌ ${err.message}` });
		return;
	}

	try {
		const payload = await renderDashboard(game.uid);
		await interaction.editReply(payload);
	} catch (error) {
		console.error('manipulate_table render error:', error);
		await interaction.editReply({ content: '❌ Failed to load the table dashboard. Please try again.' });
	}
};
