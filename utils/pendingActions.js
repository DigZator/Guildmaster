const fs   = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const FILE_PATH = path.join(__dirname, '../data/pendingActions.json');

function load() {
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, '[]', 'utf8');
    }
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
}

function save(actions) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(actions, null, 2), 'utf8');
}

function addAction(data) {
    const actions = load();
    const entry = {
        id: randomBytes(2).toString('hex').toUpperCase(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...data,
    };
    actions.push(entry);
    save(actions);
    return entry;
}

function getAll() {
    return load();
}

function getById(id) {
    return load().find(a => a.id === id) ?? null;
}

function removeById(id) {
    const actions = load();
    save(actions.filter(a => a.id !== id));
}

module.exports = { addAction, getAll, getById, removeById };
