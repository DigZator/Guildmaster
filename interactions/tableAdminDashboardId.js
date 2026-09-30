// STATUS: NOT WIRED IN. Mirrors interactions/questDashboardId.js exactly.
// Used by buttons/tableAdmin.js to encode/decode customIds for the
// /manipulate_table dashboard. Kept separate from questDashboardId.js so the
// two dashboards' id spaces can never collide.

const PREFIX = 'tableAdmin';
const SEPARATOR = ':';

function encodeId(gameUID, action, extra) {
	if (!gameUID || !action) {
		throw new Error('[tableAdminDashboardId] encodeId requires both gameUID and action.');
	}
	const parts = [PREFIX, gameUID, action];
	if (extra !== undefined && extra !== null) {
		parts.push(String(extra));
	}
	const id = parts.join(SEPARATOR);
	if (id.length > 100) {
		throw new Error(`[tableAdminDashboardId] Encoded custom_id exceeds Discord's 100-char limit: "${id}"`);
	}
	return id;
}

function decodeId(customId) {
	const parts = customId.split(SEPARATOR);
	const [prefix, gameUID, action, extra] = parts;
	if (prefix !== PREFIX) {
		throw new Error(`[tableAdminDashboardId] "${customId}" is not a table-admin dashboard custom_id.`);
	}
	return { gameUID, action, extra };
}

module.exports = { PREFIX, encodeId, decodeId };
