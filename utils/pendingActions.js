const path = require('path');
const { randomBytes } = require('crypto');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(path.join(__dirname, '../data/pendingActions.json'), []);

function addAction(data) {
    const actions = store.load();
    const entry = {
        id: randomBytes(2).toString('hex').toUpperCase(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...data,
    };
    actions.push(entry);
    store.save(actions);
    return entry;
}

function getAll() {
    return store.load();
}

function getById(id) {
    return store.load().find(a => a.id === id) ?? null;
}

function removeById(id) {
    const actions = store.load();
    store.save(actions.filter(a => a.id !== id));
}

function updateById(id, mutator) {
    const actions = store.load();
    const index = actions.findIndex(a => a.id === id);
    if (index === -1) return null;

    const result = mutator(actions[index]);
    actions[index] = result ?? actions[index];
    store.save(actions);
    return actions[index];
}

module.exports = { addAction, getAll, getById, removeById, updateById };
