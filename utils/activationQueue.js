const path = require('path');
const { createJsonStore } = require('./jsonStore');

const DEFAULT_QUEUE = {
    reminderTime: "19:00",
    activationTime: "21:00",
    reminderEnabled: true,
    autoSchedule: false,
    queue: [],
    flaggedUids: [],
    lastActivationRun: []
};

const store = createJsonStore(path.join(__dirname, '../data/activationQueue.json'), DEFAULT_QUEUE);

function getQueue() {
    return store.load();
}

function writeQueue(data) {
    store.save(data);
}

function addToQueue(game, userId) {
    const data = getQueue();
    if (data.queue.find(g => g.uid === game.uid)) return false;
    data.queue.push({
        uid: game.uid,
        title: game.title,
        addedAt: Math.floor(Date.now() / 1000),
        addedBy: userId
    });
    writeQueue(data);
    return true;
}

function removeFromQueue(uid) {
    const data = getQueue();
    const before = data.queue.length;
    data.queue = data.queue.filter(g => g.uid !== uid);
    writeQueue(data);
    return data.queue.length < before;
}

function clearQueue() {
    const data = getQueue();
    data.lastActivationRun = data.queue.map(g => g.uid);
    data.queue = [];
    writeQueue(data);
}

function clearLastActivationRun() {
    const data = getQueue();
    data.lastActivationRun = [];
    writeQueue(data);
}

function addFlaggedUid(uid) {
    const data = getQueue();
    if (!data.flaggedUids.includes(uid)) {
        data.flaggedUids.push(uid);
        writeQueue(data);
    }
}

function isFlagged(uid) {
    return getQueue().flaggedUids.includes(uid);
}

function setReminderTime(time) {
    const data = getQueue();
    data.reminderTime = time;
    writeQueue(data);
}

function setActivationTime(time) {
    const data = getQueue();
    data.activationTime = time;
    writeQueue(data);
}

function toggleReminder() {
    const data = getQueue();
    data.reminderEnabled = !data.reminderEnabled;
    writeQueue(data);
    return data.reminderEnabled;
}

function toggleAutoSchedule() {
    const data = getQueue();
    data.autoSchedule = !data.autoSchedule;
    writeQueue(data);
    return data.autoSchedule;
}

module.exports = {
    getQueue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    clearLastActivationRun,
    addFlaggedUid,
    isFlagged,
    setReminderTime,
    setActivationTime,
    toggleReminder,
    toggleAutoSchedule
};
