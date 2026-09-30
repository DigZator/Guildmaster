const path = require('path');
const crypto = require('crypto');
const { createJsonStore } = require('./jsonStore');

const dlStore = createJsonStore(path.join(__dirname, '../data/directLines.json'), []);

const locks = new Map();

function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    locks.set(key, next.catch(() => {}));
    return next;
}

function loadDirectLines() {
    return dlStore.load();
}

function saveDirectLines(records) {
    dlStore.save(records);
}

function getDirectLineByChannelId(channelId) {
    return loadDirectLines().find(dl => dl.channelId === channelId) || null;
}

function getDirectLineById(id) {
    return loadDirectLines().find(dl => dl.id === id) || null;
}

function countChannelNameUses(baseName) {
    const records = loadDirectLines();
    return records.filter(dl => dl.channelName === baseName || dl.channelName.startsWith(`${baseName}-`)).length;
}

function addDirectLine(record) {
    return withLock('__dl__', () => {
        const records = loadDirectLines();
        const full = {
            id: crypto.randomUUID(),
            status: 'open',
            filedAt: null,
            logThreadId: null,
            ...record,
        };
        records.push(full);
        saveDirectLines(records);
        return full;
    });
}

function updateDirectLine(id, patch) {
    return withLock('__dl__', () => {
        const records = loadDirectLines();
        const idx = records.findIndex(dl => dl.id === id);
        if (idx === -1) return null;
        records[idx] = { ...records[idx], ...patch };
        saveDirectLines(records);
        return records[idx];
    });
}

function removeDirectLine(id) {
    return withLock('__dl__', () => {
        const records = loadDirectLines();
        const idx = records.findIndex(dl => dl.id === id);
        if (idx === -1) return null;
        const [removed] = records.splice(idx, 1);
        saveDirectLines(records);
        return removed;
    });
}

module.exports = {
    loadDirectLines,
    saveDirectLines,
    getDirectLineByChannelId,
    getDirectLineById,
    countChannelNameUses,
    addDirectLine,
    updateDirectLine,
    removeDirectLine,
};
