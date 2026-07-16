const path = require('path');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(path.join(__dirname, '../data/anonMessages.json'), []);

function getMessages() {
    return store.load();
}

function saveMessages(messages) {
    store.save(messages);
}

function addMessage({ key, channelId, messageId }) {
    const messages = getMessages();
    if (messages.find(m => m.key === key)) return { error: 'Key already exists.' };
    messages.push({ key, channelId, messageId });
    saveMessages(messages);
    return { success: true };
}

function removeMessage(key) {
    const messages = getMessages();
    const index = messages.findIndex(m => m.key === key);
    if (index === -1) return { error: 'Key not found.' };
    const [removed] = messages.splice(index, 1);
    saveMessages(messages);
    return { success: true, removed };
}

function getMessage(key) {
    return getMessages().find(m => m.key === key) ?? null;
}

function getKeys() {
    return getMessages().map(m => m.key);
}

module.exports = { getMessages, addMessage, removeMessage, getMessage, getKeys };
