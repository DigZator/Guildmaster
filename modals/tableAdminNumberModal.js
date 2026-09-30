// STATUS: NOT WIRED IN.
// To activate later, in interactions/modalHandler.js add:
//   } else if (interaction.customId.startsWith('tableAdminNumberModal:')) {
//       await require('../modals/tableAdminNumberModal')(interaction, client);

const { setCapacity, setReserved } = require('../utils/tableAdminData');
const { renderDashboard } = require('../interactions/tableAdminDashboardRender');

module.exports = async (interaction) => {
	const [, gameUID, field] = interaction.customId.split(':'); // field: 'capacity' | 'reserved'
	const raw = interaction.fields.getTextInputValue('value').trim();
	const value = Number(raw);

	await interaction.deferUpdate();

	if (Number.isNaN(value)) {
		await interaction.editReply({ content: `❌ "${raw}" is not a number.`, embeds: [], components: [] });
		return;
	}

	try {
		if (field === 'capacity') await setCapacity(gameUID, value);
		else if (field === 'reserved') await setReserved(gameUID, value);
		else throw new Error(`Unknown field "${field}".`);

		const payload = await renderDashboard(gameUID);
		await interaction.editReply({ content: `✅ Updated.`, ...payload });
	} catch (err) {
		console.error('[tableAdminNumberModal] error:', err);
		await interaction.editReply({ content: `❌ ${err.message}`, embeds: [], components: [] });
	}
};
