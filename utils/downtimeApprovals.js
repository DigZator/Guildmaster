const path = require('path');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(path.join(__dirname, '../data/pendingDowntimeApprovals.json'), {});

function createStartRequest({ uid, characterPageId, discordUserId }) {
    const pending = store.load();
    let n = 0;
    while (pending[`S${n.toString(16).toUpperCase().padStart(4, '0')}`]) n++;
    const id = `S${n.toString(16).toUpperCase().padStart(4, '0')}`;
    pending[id] = { kind: 'start', uid, characterPageId, discordUserId, createdAt: new Date().toISOString() };
    store.save(pending);
    return id;
}

function getRequest(id) { return store.load()[id.toUpperCase()] ?? null; }
function removeRequest(id) {
    const pending = store.load();
    delete pending[id.toUpperCase()];
    store.save(pending);
}

module.exports = { createStartRequest, getRequest, removeRequest };
