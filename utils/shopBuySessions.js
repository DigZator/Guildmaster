const pendingBuys = new Map();
const timeouts = new Map();

const TIMEOUT_MS = 60_000;

function setPendingBuy(userId, data) {
	clearPendingBuy(userId, { keepData: true });
	pendingBuys.set(userId, data);

	const timeout = setTimeout(() => pendingBuys.delete(userId), TIMEOUT_MS);
	timeouts.set(userId, timeout);
}

function getPendingBuy(userId) {
	return pendingBuys.get(userId) ?? null;
}

function clearPendingBuy(userId, { keepData = false } = {}) {
	const timeout = timeouts.get(userId);
	if (timeout) clearTimeout(timeout);
	timeouts.delete(userId);
	if (!keepData) pendingBuys.delete(userId);
}

module.exports = { setPendingBuy, getPendingBuy, clearPendingBuy };
