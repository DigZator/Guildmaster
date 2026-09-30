// STATUS: NOT WIRED IN.
// To activate later, in interactions/buttonHandler.js add:
//   const tableAdmin = require('../buttons/tableAdmin');
//   ...and merge into prefixHandlers: ...tableAdmin.prefix,
//
// Previously blocked on "Player" relation having no target DB and no Status
// field on Seats — both resolved: Seats DB now has a "Seat Status" select
// (Occupied/Waitlisted/Vacated), and a separate Players DB now exists
// (PLAYERS_DATASOURCE_ID in .env). All three actions below are implemented.

const { decodeId } = require('../interactions/tableAdminDashboardId');
const { renderDashboard } = require('../interactions/tableAdminDashboardRender');
const { getTestGame, addSeat, editSeatStatus, autoAssignWaitlist } = require('../utils/tableAdminData');
const { updateGameProperties } = require('../utils/notion');
const { buildSeatSelectRow } = require('../selects/tableAdminSeatSelect');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: ModalActionRow } = require('discord.js');

function buildNumberModal(gameUID, field, title) {
	return new ModalBuilder()
		.setCustomId(`tableAdminNumberModal:${gameUID}:${field}`)
		.setTitle(title)
		.addComponents(
			new ModalActionRow().addComponents(
				new TextInputBuilder()
					.setCustomId('value')
					.setLabel('New value')
					.setStyle(TextInputStyle.Short)
					.setRequired(true),
			),
		);
}

async function refreshDashboardPayload(gameUID) {
	await getTestGame(gameUID); // re-enforces scope lock on every click, not just on open
	return renderDashboard(gameUID);
}

const prefix = {
	'tableAdmin:': async (interaction) => {
		const { gameUID, action } = decodeId(interaction.customId);

		// showModal() must be the FIRST response to the interaction — it can't
		// follow a deferUpdate(). Handle modal-opening actions before the
		// blanket defer below.
		if (action === 'alterCapacity') {
			return interaction.showModal(buildNumberModal(gameUID, 'capacity', 'Alter capacity'));
		}
		if (action === 'alterReserved') {
			return interaction.showModal(buildNumberModal(gameUID, 'reserved', 'Alter reserved seats'));
		}

		// Ack immediately — every branch below does at least one Notion round
		// trip before it has anything to show, and Discord expires the
		// interaction (10062) if it doesn't hear back within ~3s. deferUpdate()
		// acks without changing the message yet; editReply/followUp come after.
		await interaction.deferUpdate();

		try {
			switch (action) {
				case 'refresh': {
					const payload = await refreshDashboardPayload(gameUID);
					return await interaction.editReply(payload);
				}

				case 'addSeat': {
					// Open, unassigned seat with no status set yet — admin
					// promotes it via Edit status once a player fills it.
					await addSeat(gameUID);
					const payload = await refreshDashboardPayload(gameUID);
					return await interaction.editReply(payload);
				}

				case 'addPlayer': {
					const row = await buildSeatSelectRow(gameUID, 'addPlayer');
					if (!row) return await interaction.followUp({ content: '❌ No seats exist yet — add a seat first.', flags: 64 });
					return await interaction.followUp({ content: 'Which seat is this player going into?', components: [row], flags: 64 });
				}

				case 'editStatus': {
					const row = await buildSeatSelectRow(gameUID, 'editStatus');
					if (!row) return await interaction.followUp({ content: '❌ No seats exist yet.', flags: 64 });
					return await interaction.followUp({ content: 'Which seat do you want to update?', components: [row], flags: 64 });
				}

				case 'setStatus': {
					const [seatId, status] = interaction.customId.split(':').pop().split('|');
					await editSeatStatus(gameUID, seatId, status);
					const payload = await refreshDashboardPayload(gameUID);
					await interaction.editReply(payload);
					return;
				}

				case 'autoAssignWaitlist': {
					const result = await autoAssignWaitlist(gameUID);
					const payload = await refreshDashboardPayload(gameUID);
					await interaction.editReply(payload);
					await interaction.followUp({ content: `⚖️ Demoted ${result.demotedCount}/${result.requested} seat(s) to Waitlisted.`, flags: 64 });
					return;
				}

				default:
					console.warn(`[tableAdmin] Unhandled dashboard action: ${action}`);
					return await interaction.followUp({ content: '❌ Unknown action.', flags: 64 });
			}
		} catch (err) {
			console.error('[tableAdmin] button error:', err);
			const payload = { content: `❌ ${err.message}`, flags: 64 };
			await interaction.followUp(payload).catch(() => {});
		}
	},

	// Separate id space — posted by utils/tableAdminWatcher.js in the ctrl
	// channel when Open Seats frees back up after a close. Deliberately not
	// merged into the 'tableAdmin:' prefix above since it isn't tied to a
	// dashboard message and doesn't need the scope-lock re-check pattern
	// (getTestGame is still called, just inline here).
	'tableAdminReactivate:': async (interaction) => {
		const [, gameUID, choice] = interaction.customId.split(':');
		await interaction.deferUpdate();

		try {
			await getTestGame(gameUID); // scope lock
			if (choice === 'yes') {
				await updateGameProperties(gameUID, { 'Activate': { checkbox: true } });
				await interaction.editReply({ content: '🟢 Reopened sign-ups.', components: [] });
			} else {
				await interaction.editReply({ content: 'Left closed.', components: [] });
			}
		} catch (err) {
			console.error('[tableAdmin] reactivate error:', err);
			await interaction.editReply({ content: `❌ ${err.message}`, components: [] });
		}
	},
};

module.exports = { prefix };
