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
            filedBy: null,
            logThreadId: null,
            accessLog: [],
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

function mutateDirectLine(id, fn) {
    return withLock('__dl__', () => {
        const records = loadDirectLines();
        const idx = records.findIndex(dl => dl.id === id);
        if (idx === -1) return null;
        records[idx] = { ...records[idx], ...fn(records[idx]) };
        saveDirectLines(records);
        return records[idx];
    });
}

function transitionDirectLine(id, allowedStatuses, patch) {
    return withLock('__dl__', () => {
        const records = loadDirectLines();
        const idx = records.findIndex(dl => dl.id === id);
        if (idx === -1) return { ok: false, reason: 'missing' };
        if (!allowedStatuses.includes(records[idx].status)) {
            return { ok: false, reason: 'status', record: records[idx] };
        }
        records[idx] = { ...records[idx], ...patch };
        saveDirectLines(records);
        return { ok: true, record: records[idx] };
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

(function recoverInterruptedFilings() {
    const records = loadDirectLines();
    let recovered = 0;
    for (const record of records) {
        if (record.status === 'filing') {
            record.status = 'open';
            recovered++;
        }
    }
    if (recovered) {
        saveDirectLines(records);
        console.warn(`[directLineStore] ${recovered} direct line(s) were mid-filing when the bot stopped and have been set back to open. Check for a partial log thread before filing again.`);
    }
})();

module.exports = {
    loadDirectLines,
    saveDirectLines,
    getDirectLineByChannelId,
    getDirectLineById,
    countChannelNameUses,
    addDirectLine,
    updateDirectLine,
    mutateDirectLine,
    transitionDirectLine,
    removeDirectLine,
};
