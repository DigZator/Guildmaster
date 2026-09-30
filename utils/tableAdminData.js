// tableAdminData.js
//
// STATUS: NOT WIRED IN. This module is not required by index.js, deploy-commands.js,
// or commandHandler.js. It exists so we can build/test the /manipulate_table data
// layer in isolation before any command or button touches it.
//
// SCOPE LOCK: every exported function only operates on the Notion game whose
// Title === "Test". This is a deliberate, temporary guard while we build out
// the new admin-dashboard commands against live data. Remove getTestGame()'s
// title check (and generalize callers to accept any resolved game) once we're
// ready to widen scope past the single test game.
//
// SCHEMA NOTE (per discussion): "Current Count" is a read-only Notion formula
// property living on the Game page itself (Games DB), counting related Player
// pages. It is treated here strictly as a display value — never as a write
// target. Seat/player status (Occupied / Waitlist / Vacated) does not exist
// as a real Notion field yet; until that schema change lands, status shown
// here is *derived* in code from Fillout submission order vs. currentCount,
// mirroring the logic formatPlayerList() already uses for the existing
// /get_players command. Swap this derivation out once the real Status field
// exists on the Seats DB.

const { fetchPage, fetchSeats, createSeat, createPlayerPage, assignPlayerToSeat, setSeatStatus, updateGameProperties } = require('./notion');
const { getCachedGames } = require('./cache');
const { getPlayers } = require('./fillout');

const TARGET_GAME_TITLE = 'Test';
const CURRENT_COUNT_PROPERTY_NAME = 'Open Seats';

/**
 * Resolves the single game this whole module is scoped to.
 * Throws if the cached "Test" game can't be found, or if a caller passes a
 * uid that doesn't resolve to the "Test" game (defense in depth — commands
 * should already be validating this before calling into this module).
 */
async function getTestGame(uid) {
	const games = await getCachedGames();
	const game = uid
		? games.find(g => g.uid === uid)
		: games.find(g => g.title?.trim() === TARGET_GAME_TITLE);

	if (!game) {
		throw new Error(`[tableAdminData] Could not resolve a game (uid=${uid ?? 'none given'}).`);
	}
	if (game.title?.trim() !== TARGET_GAME_TITLE) {
		throw new Error(`[tableAdminData] Refusing to operate on "${game.title}" — this module is scoped to "${TARGET_GAME_TITLE}" only.`);
	}
	return game;
}

/**
 * Reads the "Current Count" formula property directly off the Game page.
 * Read-only display value — do not attempt to write to this property.
 */
async function fetchCurrentCount(gameUID) {
	const page = await fetchPage(gameUID);
	const prop = page.properties?.[CURRENT_COUNT_PROPERTY_NAME];

	if (!prop) {
		console.warn(`[tableAdminData] "${CURRENT_COUNT_PROPERTY_NAME}" property not found on page ${gameUID}.`);
		return null;
	}

	// Formula properties nest the actual value under a `formula` object,
	// typed by whatever the formula resolves to (usually `number` here).
	if (prop.type === 'formula') {
		return prop.formula?.number ?? null;
	}

	// Fallback in case this ever gets reconfigured as a plain number/rollup.
	return prop.number ?? prop.rollup?.number ?? null;
}

/**
 * Filtered Seats DB rows for this one game (thin wrapper around the
 * already-exported fetchSeats(), scoped down to a single gameId).
 */
async function fetchGameSeats(gameUID) {
	const allSeats = await fetchSeats();
	return allSeats.filter(s => s.gameId === gameUID);
}

/**
 * The merged, sorted list the dashboard's first screen needs:
 * Fillout signups for this game, in registration order, each annotated
 * with a derived status (Occupied vs Waitlist) based on currentCount.
 *
 * This does NOT read/write per-player Notion rows individually — there's no
 * join key (Submission ID) on the Seats DB yet. Once that schema change
 * lands, this function is the one to rework to join on it directly instead
 * of deriving status from position + currentCount.
 */
async function fetchMergedPlayerList(uid) {
	const game = await getTestGame(uid);
	const [currentCount, filloutPlayers, seats] = await Promise.all([
		fetchCurrentCount(game.uid),
		getPlayers(game.uid),
		fetchGameSeats(game.uid),
	]);

	const sorted = [...filloutPlayers].sort(
		(a, b) => new Date(a.submissionTime) - new Date(b.submissionTime)
	);

	const capacity = currentCount ?? seats.length ?? 0;
	let seatsSoFar = 0;

	const rows = sorted.map(p => {
		const count = p.seatCount || 1;
		seatsSoFar += count;
		return {
			submissionId: p.submissionId,
			submissionTime: p.submissionTime,
			fullName: p.fullName,
			discordUsername: p.discordUsername,
			seatCount: count,
			// Derived, not a real Notion field yet — see module header note.
			status: seatsSoFar <= capacity ? 'Occupied' : 'Waitlist',
		};
	});

	return {
		game: {
			uid: game.uid,
			title: game.title,
			totalSeats: game.totalSeats,
		},
		currentCount,
		capacity,
		seatsTakenFromNotion: seats.filter(s => s.taken).length,
		players: rows,
	};
}

const VALID_SEAT_STATUSES = ['Occupied', 'Waitlisted', 'Vacated'];

async function fetchTestGameCounts(gameUID) {
	const page = await fetchPage(gameUID);
	const p = page.properties;
	const readNumber = (name) => {
		const prop = p[name];
		if (!prop) return null;
		if (prop.type === 'number') return prop.number ?? null;
		if (prop.type === 'formula') return prop.formula?.number ?? null;
		return null;
	};
	return {
		capacity: readNumber('Total Capacity'),
		reserved: readNumber('Reserved Seats'),
		occupied: readNumber('Occupied Seats'),
		open: readNumber('Open Seats'),
	};
}

/**
 * Creates a new, unassigned seat row for the "Test" game. status is
 * optional — pass e.g. 'Vacated' for an open seat, or omit to leave the
 * Seat Status property unset.
 */
async function addSeat(uid, status) {
	const game = await getTestGame(uid);
	if (status && !VALID_SEAT_STATUSES.includes(status)) {
		throw new Error(`Invalid seat status "${status}". Must be one of: ${VALID_SEAT_STATUSES.join(', ')}.`);
	}
	return createSeat(game.uid, status);
}

/**
 * Creates a Players DB page for `playerName` and assigns it to `seatId`,
 * marking that seat Occupied. seatId must already exist (created via
 * addSeat) and belong to a "Test" game seat — callers should confirm that
 * via fetchGameSeats() before calling this.
 */
async function addPlayerToSeat(uid, seatId, playerName) {
	await getTestGame(uid); // scope lock, even though seatId is the real target
	if (!playerName || !playerName.trim()) {
		throw new Error('Player name is required.');
	}
	const playerPage = await createPlayerPage(playerName.trim());
	await assignPlayerToSeat(seatId, playerPage.id);
	await setSeatStatus(seatId, 'Occupied');
	return playerPage;
}

/**
 * Updates an existing seat's Seat Status (Occupied / Waitlisted / Vacated).
 * Does not touch the Player relation — use this for promote/vacate/waitlist
 * transitions on a seat that's already assigned.
 */
async function editSeatStatus(uid, seatId, status) {
	await getTestGame(uid); // scope lock
	if (!VALID_SEAT_STATUSES.includes(status)) {
		throw new Error(`Invalid seat status "${status}". Must be one of: ${VALID_SEAT_STATUSES.join(', ')}.`);
	}
	return setSeatStatus(seatId, status);
}

/**
 * Overwrites Total Capacity / Reserved Seats on the Games DB. Occupied Seats
 * and Open Seats are Notion formulas — never written directly.
 */
async function setCapacity(uid, value) {
	const game = await getTestGame(uid);
	if (typeof value !== 'number' || Number.isNaN(value)) throw new Error('Capacity must be a number.');
	return updateGameProperties(game.uid, { 'Total Capacity': { number: value } });
}

async function setReserved(uid, value) {
	const game = await getTestGame(uid);
	if (typeof value !== 'number' || Number.isNaN(value)) throw new Error('Reserved seats must be a number.');
	return updateGameProperties(game.uid, { 'Reserved Seats': { number: value } });
}

/**
 * Demotes the |Open Seats| most-recently-created Occupied seats to
 * Waitlisted, so Open Seats returns to 0. Uses each seat's Notion
 * created_time as a stand-in for registration order — see the createdTime
 * comment in notion.js's fetchSeats() for why. Only valid to call when
 * Open Seats is negative; throws otherwise so it can't be mis-clicked.
 */
async function autoAssignWaitlist(uid) {
	const game = await getTestGame(uid);
	const counts = await fetchTestGameCounts(game.uid);
	const openVal = counts.open ?? 0;
	if (openVal >= 0) {
		throw new Error('Open Seats is not negative — nothing to auto-assign.');
	}

	const overbookCount = Math.abs(openVal);
	const seats = await fetchGameSeats(game.uid);
	const occupied = seats
		.filter(s => s.status === 'Occupied')
		.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime)); // most recent first

	const toDemote = occupied.slice(0, overbookCount);
	for (const seat of toDemote) {
		await setSeatStatus(seat.id, 'Waitlisted');
	}

	return { demotedSeatIds: toDemote.map(s => s.id), demotedCount: toDemote.length, requested: overbookCount };
}

module.exports = {
	TARGET_GAME_TITLE,
	VALID_SEAT_STATUSES,
	getTestGame,
	fetchCurrentCount,
	fetchTestGameCounts,
	fetchGameSeats,
	fetchMergedPlayerList,
	addSeat,
	addPlayerToSeat,
	editSeatStatus,
	setCapacity,
	setReserved,
	autoAssignWaitlist,
};
