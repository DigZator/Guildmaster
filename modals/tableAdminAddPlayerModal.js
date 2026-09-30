// STATUS: NOT WIRED IN.
// To activate later, in interactions/modalHandler.js add:
//   } else if (interaction.customId.startsWith('tableAdminAddPlayerModal:')) {
//       await require('../modals/tableAdminAddPlayerModal')(interaction, client);

const { addPlayerToSeat } = require('../utils/tableAdminData');
const { renderDashboard } = require('../interactions/tableAdminDashboardRender');

module.exports = async (interaction) => {
	const [, gameUID, seatId] = interaction.customId.split(':');
	const playerName = interaction.fields.getTextInputValue('playerName').trim();

	await interaction.deferUpdate();

	try {
		await addPlayerToSeat(gameUID, seatId, playerName);
		const payload = await renderDashboard(gameUID);
		await interaction.editReply({ content: `✅ Added **${playerName}** to the seat.`, ...payload });
	} catch (err) {
		console.error('[tableAdminAddPlayerModal] error:', err);
		await interaction.editReply({ content: `❌ ${err.message}`, embeds: [], components: [] });
	}
};
