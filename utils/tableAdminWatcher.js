// STATUS: NOT WIRED IN.
// To activate later, in index.js add (near the other .init(client) calls):
//   require('./utils/tableAdminWatcher').init(client);
//
// SCOPE LOCK: this is a deliberately SEPARATE watcher from utils/deactivator.js,
// not a modification of it. deactivator.js keeps working exactly as before for
// every game, including "Test" — this file adds Test-only behavior on top,
// using the new Total Capacity / Reserved Seats / Occupied Seats / Open Seats
// formula fields that only exist on the Test game page right now. If those
// fields get rolled out to other games later, this watcher would need its
// scope widened deliberately — it will not pick up other games on its own,
// since every check here goes through getTestGame().

const { onCacheRefresh } = require('./cache');
const { getTestGame, fetchTestGameCounts } = require('./tableAdminData');
const { updateGameProperties } = require('./notion');
const { GUILDMASTER_CTRL_CHANNEL_ID, BOT_DEBUGGING_CHANNEL_ID } = require('../data/channels');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

let ctrlChannel = null;
let lastOpenValue = null; // module-level, tracks the last seen Open Seats value across refreshes

function init(client) {
	const ctrlChannelId = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : GUILDMASTER_CTRL_CHANNEL_ID;

	client.once('clientReady', () => {
		ctrlChannel = client.channels.cache.get(ctrlChannelId);
		if (!ctrlChannel) console.warn('[tableAdminWatcher] Control channel not found.');
	});

	onCacheRefresh(async () => {
		let game;
		try {
			game = await getTestGame();
		} catch {
			return; // "Test" game not found this cycle — nothing to watch yet.
		}

		let counts;
		try {
			counts = await fetchTestGameCounts(game.uid);
		} catch (err) {
			console.error('[tableAdminWatcher] Failed to read Test game counts:', err);
			return;
		}

		const open = counts.open;
		if (open === null || open === undefined) return; // fields not set up yet

		const previous = lastOpenValue;
		lastOpenValue = open;
		if (previous === null) return; // first run this session — establish baseline only

		// Crossed to full (0 or below) — close the form.
		if (previous > 0 && open <= 0) {
			try {
				await updateGameProperties(game.uid, { 'Activate': { checkbox: false } });
				console.log(`[tableAdminWatcher] Closed "${game.title}" (Open Seats = ${open}).`);
				if (ctrlChannel) {
					await ctrlChannel.send(`🔴 **Test — Seats Filled:** Open Seats hit ${open}. Sign-ups closed automatically.`);
				}
			} catch (err) {
				console.error('[tableAdminWatcher] Failed to close Test game:', err);
			}
		}

		// Went negative (overbooked) — alert, don't auto-fix.
		if (open < 0 && previous >= 0) {
			if (ctrlChannel) {
				try {
					await ctrlChannel.send(
						`⚠️ **Test — Overbooked:** Open Seats is now ${open}. Use the dashboard's "Auto assign waitlist" button, or resolve manually.`
					);
				} catch (err) {
					console.error('[tableAdminWatcher] Failed to send overbooked alert:', err);
				}
			}
		}

		// Freed back up from <=0 to positive — ask, don't silently reactivate.
		if (previous <= 0 && open > 0) {
			if (ctrlChannel) {
				try {
					const row = new ActionRowBuilder().addComponents(
						new ButtonBuilder()
							.setCustomId(`tableAdminReactivate:${game.uid}:yes`)
							.setLabel('Reopen sign-ups')
							.setStyle(ButtonStyle.Success),
						new ButtonBuilder()
							.setCustomId(`tableAdminReactivate:${game.uid}:no`)
							.setLabel('Leave closed')
							.setStyle(ButtonStyle.Secondary),
					);
					await ctrlChannel.send({
						content: `🟢 **Test — Seat freed up:** Open Seats is now ${open}. Reopen sign-ups?`,
						components: [row],
					});
				} catch (err) {
					console.error('[tableAdminWatcher] Failed to send reopen prompt:', err);
				}
			}
		}
	});
}

module.exports = { init };
