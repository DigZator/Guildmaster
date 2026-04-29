const fs   = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../data/rssFeeds.json');

function ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, '[]');
}

function getFeeds() {
    ensureStore();
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
}

function saveFeeds(feeds) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(feeds, null, 2));
}

function addFeed({ url, name, channelId }) {
    const feeds = getFeeds();
    if (feeds.find(f => f.url === url)) return { error: 'Feed already exists.' };
    feeds.push({ url, name, channelId, lastPostTitle: null, lastPostUnix: Math.floor(Date.now() / 1000) });
    saveFeeds(feeds);
    return { success: true };
}

function removeFeed(query) {
    const feeds = getFeeds();
    const index = feeds.findIndex(f => f.url === query || f.name.toLowerCase() === query.toLowerCase());
    if (index === -1) return { error: 'Feed not found.' };
    const [removed] = feeds.splice(index, 1);
    saveFeeds(feeds);
    return { success: true, removed };
}

function updateFeed(url, { lastPostTitle, lastPostUnix }) {
    const feeds = getFeeds();
    const feed  = feeds.find(f => f.url === url);
    if (!feed) return;
    feed.lastPostTitle = lastPostTitle;
    feed.lastPostUnix  = lastPostUnix;
    saveFeeds(feeds);
}

module.exports = { getFeeds, addFeed, removeFeed, updateFeed };