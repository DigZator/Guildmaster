const path = require('path');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(path.join(__dirname, '../data/memorialIndex.json'), {
    entries: [], // { messageId, authorId, characterName, postedAt }
});

function addEntry({ messageId, authorId, characterName, postedAt }) {
    const data = store.load();
    data.entries = data.entries.filter(e => e.messageId !== messageId);
    data.entries.push({ messageId, authorId, characterName, postedAt: postedAt ?? Date.now() });
    store.save(data);
}

function removeEntry(messageId) {
    const data = store.load();
    const before = data.entries.length;
    data.entries = data.entries.filter(e => e.messageId !== messageId);
    store.save(data);
    return data.entries.length < before;
}

function getEntriesForAuthor(authorId) {
    return store.load().entries.filter(e => e.authorId === authorId);
}

function replaceAll(entries) {
    store.save({ entries });
}

function getAll() {
    return store.load().entries;
}

module.exports = { addEntry, removeEntry, getEntriesForAuthor, replaceAll, getAll };
