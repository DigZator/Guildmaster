// SCOPE LOCK: only operates on the "Test" game (see utils/tableAdminData.js).

const { getTestGame } = require('../utils/tableAdminData');
const { renderDashboard } = require('../interactions/tableAdminDashboardRender');

module.exports = async (interaction) => {

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
