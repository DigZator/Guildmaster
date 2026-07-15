const fs = require('fs');
const path = require('path');
const PATH_ = path.join(__dirname, '..', 'data', 'pendingDowntimeApprovals.json');

function load() { try { return JSON.parse(fs.readFileSync(PATH_, 'utf8')); } catch { return {}; } }
function save(data) { fs.mkdirSync(path.dirname(PATH_), { recursive: true }); fs.writeFileSync(PATH_, JSON.stringify(data, null, 2)); }

function createStartRequest({ uid, characterPageId, discordUserId }) {
    const pending = load();
    let n = 0;
    while (pending[`S${n.toString(16).toUpperCase().padStart(4, '0')}`]) n++;
    const id = `S${n.toString(16).toUpperCase().padStart(4, '0')}`;
    pending[id] = { kind: 'start', uid, characterPageId, discordUserId, createdAt: new Date().toISOString() };
    save(pending);
    return id;
}

function getRequest(id) { return load()[id.toUpperCase()] ?? null; }
function removeRequest(id) { const pending = load(); delete pending[id.toUpperCase()]; save(pending); }

module.exports = { createStartRequest, getRequest, removeRequest };
