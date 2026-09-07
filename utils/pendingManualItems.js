const pending = new Map();
const timeouts = new Map();

const TIMEOUT_MS = 5 * 60_000;

function setPendingManualItem(userId, data) {
    clearPendingManualItem(userId, { keepData: true });
    pending.set(userId, data);

    const timeout = setTimeout(() => pending.delete(userId), TIMEOUT_MS);
    timeouts.set(userId, timeout);
}

function getPendingManualItem(userId) {
    return pending.get(userId) ?? null;
}

function clearPendingManualItem(userId, { keepData = false } = {}) {
    const timeout = timeouts.get(userId);
    if (timeout) clearTimeout(timeout);
    timeouts.delete(userId);
    if (!keepData) pending.delete(userId);
}

module.exports = { setPendingManualItem, getPendingManualItem, clearPendingManualItem };
