const path = require('path');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(path.join(__dirname, '../data/verification.json'), { users: {} });

function load() {
    const data = store.load();
    if (!data.users || typeof data.users !== 'object') data.users = {};
    return data;
}

function get(userId) {
    return load().users[userId] || null;
}

function all() {
    return load().users;
}

function mutate(fn) {
    const data = load();
    const result = fn(data.users);
    if (result !== false) store.save(data);
    return result;
}

function update(userId, fn) {
    return mutate(users => {
        const entry = users[userId] || {};
        const result = fn(entry);
        if (result === false) return false;
        if (isEmpty(entry)) delete users[userId];
        else users[userId] = entry;
        return result;
    });
}

function remove(userId) {
    return mutate(users => {
        if (!users[userId]) return false;
        delete users[userId];
    });
}

function clearKeepingLock(userId, now = Date.now()) {
    return mutate(users => {
        const entry = users[userId];
        if (!entry) return false;
        if (entry.lockedUntil && entry.lockedUntil > now) {
            users[userId] = { lockedUntil: entry.lockedUntil, attemptsUsed: entry.attemptsUsed || 0 };
        } else {
            delete users[userId];
        }
    });
}

function isEmpty(entry) {
    return !entry.currentAnswer && !entry.attemptsUsed && !entry.lockedUntil
        && !entry.trackedSince && !entry.sessionStartedAt;
}

module.exports = { get, all, mutate, update, remove, clearKeepingLock, isEmpty };
