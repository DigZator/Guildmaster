const pendingSells = new Map();
const timeouts = new Map();

const TIMEOUT_MS = 60_000;

function setPendingSell(userId, data) {
	clearPendingSell(userId, { keepData: true });
	pendingSells.set(userId, data);

	const timeout = setTimeout(() => pendingSells.delete(userId), TIMEOUT_MS);
	timeouts.set(userId, timeout);
}

function getPendingSell(userId) {
	return pendingSells.get(userId) ?? null;
}

function clearPendingSell(userId, { keepData = false } = {}) {
	const timeout = timeouts.get(userId);
	if (timeout) clearTimeout(timeout);
	timeouts.delete(userId);
	if (!keepData) pendingSells.delete(userId);
}

module.exports = { setPendingSell, getPendingSell, clearPendingSell };
