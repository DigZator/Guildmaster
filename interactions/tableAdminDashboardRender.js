// STATUS: NOT WIRED IN. Pure render layer for the /manipulate_table dashboard
// wireframe we sketched: header (game + seat count), a table of players
// sorted by registration timestamp, and an action row.
//
// This module only reads (via tableAdminData.fetchMergedPlayerList) and
// builds Discord UI objects. It never writes to Notion.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fetchMergedPlayerList, fetchTestGameCounts } = require('../utils/tableAdminData');
const { encodeId } = require('./tableAdminDashboardId');

function formatTimestamp(isoString) {
	if (!isoString) return 'N/A';
	const date = new Date(isoString);
	if (isNaN(date.getTime())) return String(isoString);
	return date.toLocaleString('en-IN', {
		timeZone: 'Asia/Kolkata',
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
	});
}

function statusEmoji(status) {
	return status === 'Occupied' ? '🟢' : '🟡';
}

/**
 * Builds the embed + component rows for the dashboard's main (only, for now)
 * screen. Returns { embeds, components } ready to hand to
 * interaction.editReply()/update().
 */
async function renderDashboard(gameUID) {
	const [data, counts] = await Promise.all([
		fetchMergedPlayerList(gameUID),
		fetchTestGameCounts(gameUID),
	]);

	const lines = data.players.length
		? data.players.map((p, i) => {
			const seatNote = p.seatCount > 1 ? ` (×${p.seatCount})` : '';
			return `${statusEmoji(p.status)} \`${formatTimestamp(p.submissionTime)}\` — **${p.fullName}**${seatNote} (${p.discordUsername}) — ${p.status}`;
		})
		: ['_No sign-ups yet._'];

	const embed = new EmbedBuilder()
		.setTitle(`🎲 ${data.game.title.trim()} — table management`)
		.setDescription(lines.join('\n'))
		.addFields({
			name: 'Seats',
			value: `Capacity: **${counts.capacity ?? 'N/A'}** · Reserved: **${counts.reserved ?? 'N/A'}** · Occupied: **${counts.occupied ?? 'N/A'}** · Open: **${counts.open ?? 'N/A'}**`,
		})
		.setColor(counts.open !== null && counts.open < 0 ? 0xED4245 : 0x5865F2)
		.setFooter({ text: 'Status is derived from Fillout order vs. counts above — not yet a real per-seat join. Last synced' })
		.setTimestamp();

	const actionRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(encodeId(gameUID, 'addSeat'))
			.setLabel('➕ Add seat')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(encodeId(gameUID, 'addPlayer'))
			.setLabel('👤 Add player')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(encodeId(gameUID, 'editStatus'))
			.setLabel('✏️ Edit player status')
			.setStyle(ButtonStyle.Secondary),
	);

	const capacityRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(encodeId(gameUID, 'alterCapacity'))
			.setLabel('🧮 Alter capacity')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(encodeId(gameUID, 'alterReserved'))
			.setLabel('🔖 Alter reserved')
			.setStyle(ButtonStyle.Secondary),
	);

	// Only shown when overbooked — matches "auto assign is only applicable
	// when open is negative" from the spec.
	if (counts.open !== null && counts.open < 0) {
		capacityRow.addComponents(
			new ButtonBuilder()
				.setCustomId(encodeId(gameUID, 'autoAssignWaitlist'))
				.setLabel('⚖️ Auto assign waitlist')
				.setStyle(ButtonStyle.Danger),
		);
	}

	const utilityRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(encodeId(gameUID, 'refresh'))
			.setLabel('🔄 Refresh')
			.setStyle(ButtonStyle.Primary),
	);

	return { embeds: [embed], components: [actionRow, capacityRow, utilityRow] };
}

module.exports = { renderDashboard, formatTimestamp };
