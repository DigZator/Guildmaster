const path = require('path');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(path.join(__dirname, '../data/keepAliveThreads.json'), []);

function getAll() {
    return store.load();
}

function get(threadId) {
    return getAll().find(e => e.threadId === threadId) ?? null;
}

function has(threadId) {
    return get(threadId) !== null;
}

function add({ threadId, guildId, addedBy }) {
    const entries = getAll();
    if (entries.some(e => e.threadId === threadId)) return { error: 'Thread is already registered.' };
    const entry = {
        threadId,
        guildId,
        addedBy,
        addedAt: Date.now(),
        lastRefreshedAt: null,
        lastRefreshMessageId: null,
    };
    entries.push(entry);
    store.save(entries);
    return { success: true, entry };
}

function remove(threadId) {
    const entries = getAll();
    const index = entries.findIndex(e => e.threadId === threadId);
    if (index === -1) return { error: 'Thread is not registered.' };
    const [removed] = entries.splice(index, 1);
    store.save(entries);
    return { success: true, removed };
}

function markRefreshed(threadId, { at = Date.now(), messageId = null } = {}) {
    const entries = getAll();
    const entry = entries.find(e => e.threadId === threadId);
    if (!entry) return;
    entry.lastRefreshedAt = at;
    entry.lastRefreshMessageId = messageId;
    store.save(entries);
}

module.exports = { getAll, get, has, add, remove, markRefreshed };
