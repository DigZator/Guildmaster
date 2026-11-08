const DRAFT_TTL_MS = 30 * 60 * 1000; // 30 minutes

const store = new Map();
const timeouts = new Map();

function set(userId, value) {
    if (timeouts.has(userId)) {
        clearTimeout(timeouts.get(userId));
    }
    store.set(userId, value);
    const timeout = setTimeout(() => {
        store.delete(userId);
        timeouts.delete(userId);
    }, DRAFT_TTL_MS);
    timeouts.set(userId, timeout);
}

function get(userId) {
    return store.get(userId);
}

function has(userId) {
    return store.has(userId);
}

function del(userId) {
    if (timeouts.has(userId)) {
        clearTimeout(timeouts.get(userId));
        timeouts.delete(userId);
    }
    return store.delete(userId);
}

module.exports = { set, get, has, delete: del };
