// STATUS: NOT WIRED IN.
// To activate later, in interactions/selectHandler.js add:
//   if (interaction.customId.startsWith('tableAdminSeatSelect:')) {
//       await require('../selects/tableAdminSeatSelect').handle(interaction);
//   }

const { StringSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fetchGameSeats } = require('../utils/tableAdminData');
const { encodeId } = require('../interactions/tableAdminDashboardId');

function seatLabel(seat, index) {
	const statusPart = seat.status ? seat.status : 'No status set';
	return `Seat ${index + 1} — ${statusPart}${seat.playerId ? ' (assigned)' : ' (open)'}`;
}

/**
 * mode: 'addPlayer' | 'editStatus' — controls what happens after a seat is picked.
 */
async function buildSeatSelectRow(gameUID, mode) {
	const seats = await fetchGameSeats(gameUID);
	if (!seats.length) return null;

	const options = seats.slice(0, 25).map((seat, i) => ({
		label: seatLabel(seat, i),
		value: seat.id,
	}));

	const select = new StringSelectMenuBuilder()
		.setCustomId(`tableAdminSeatSelect:${gameUID}:${mode}`)
		.setPlaceholder('Choose a seat')
		.addOptions(options);

	return new ActionRowBuilder().addComponents(select);
}

async function handle(interaction) {
	const [, gameUID, mode] = interaction.customId.split(':');
	const seatId = interaction.values[0];

	if (mode === 'addPlayer') {
		const modal = new ModalBuilder()
			.setCustomId(`tableAdminAddPlayerModal:${gameUID}:${seatId}`)
			.setTitle('Add player to seat')
			.addComponents(
				new ActionRowBuilder().addComponents(
					new TextInputBuilder()
						.setCustomId('playerName')
						.setLabel('Player name')
						.setStyle(TextInputStyle.Short)
						.setRequired(true),
				),
			);
		return interaction.showModal(modal);
	}

	if (mode === 'editStatus') {
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(encodeId(gameUID, 'setStatus', `${seatId}|Occupied`)).setLabel('Occupied').setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId(encodeId(gameUID, 'setStatus', `${seatId}|Waitlisted`)).setLabel('Waitlisted').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(encodeId(gameUID, 'setStatus', `${seatId}|Vacated`)).setLabel('Vacated').setStyle(ButtonStyle.Danger),
		);
		return interaction.update({ content: 'Pick the new status for this seat:', components: [row], embeds: [] });
	}
}

module.exports = { buildSeatSelectRow, handle };
