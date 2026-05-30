const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/activationQueue.json');

const DEFAULT_QUEUE = {
    reminderTime: "19:00",
    activationTime: "21:00",
    reminderEnabled: true,
    queue: [],
    flaggedUids: [],
    lastActivationRun: []
};

function getQueue() {
	try {
    	return JSON.parse(fs.readFileSync(FILE, 'utf8'));
	} catch (err) {
		if (err.code === 'ENOENT') {
			// File doesnt exist
			return { ...DEFAULT_QUEUE };
		}
		// File is malformed
		console.error('activationQueue.json is malformed, using defaults:', err);
		return { ...DEFAULT_QUEUE };
	}
}

function writeQueue(data) {
    try {
    	fs.writeFileSync(FILE, JSON.stringify(data, null, 4), 'utf8');
    } catch	(err) {
    	console.error('Failed to write activationQueue.json:', err);
    	throw err;
    }
}

function addToQueue(game, userId) { //false - already present cannot add, true - added 
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

function removeFromQueue(uid) { //false - could not delete/not found, true - entry deleted
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
    toggleReminder
};
