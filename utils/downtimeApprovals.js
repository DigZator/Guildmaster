const fs = require('fs');
const path = require('path');
const PATH_ = path.join(__dirname, '..', 'data', 'pendingDowntimeApprovals.json');

function load() { try { return JSON.parse(fs.readFileSync(PATH_, 'utf8')); } catch { return {}; } }
function save(data) { fs.mkdirSync(path.dirname(PATH_), { recursive: true }); fs.writeFileSync(PATH_, JSON.stringify(data, null, 2)); }

function createStartRequest({ activityId, characterPageId, discordUserId, paramValue }) {
    const pending = load();
    let n = 0;
    while (pending[n.toString(16).toUpperCase().padStart(4, '0')]) n++;
    const id = n.toString(16).toUpperCase().padStart(4, '0');
    pending[id] = { kind: 'start', activityId, characterPageId, discordUserId, paramValue, createdAt: new Date().toISOString() };
    save(pending);
    return id;
}

function getRequest(id) { return load()[id.toUpperCase()] ?? null; }
function removeRequest(id) { const pending = load(); delete pending[id.toUpperCase()]; save(pending); }

module.exports = { createStartRequest, getRequest, removeRequest };
