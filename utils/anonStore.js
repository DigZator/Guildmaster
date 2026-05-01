const fs   = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../data/anonMessages.json');

function ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, '[]');
}

function getMessages() {
    ensureStore();
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
}

function saveMessages(messages) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(messages, null, 2));
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