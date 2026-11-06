// When a file moves, a path written relative to it ('../data/x.json') silently points somewhere else.
// These tests pin where each moved feature reads and writes, by absolute location, so a move cannot change it.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('messaging: the RSS and anonymous-message stores still use data/rssFeeds.json and data/anonMessages.json', () => {
    const jsonStorePath = require.resolve('../utils/jsonStore');
    const real = require(jsonStorePath);
    const seen = [];
    require.cache[jsonStorePath].exports = { ...real, createJsonStore: (filePath, def) => { seen.push(filePath); return real.createJsonStore(filePath, def); } };
    try {
        for (const mod of ['../features/messaging/rss/store', '../features/messaging/anon/store']) {
            delete require.cache[require.resolve(mod)];
            require(mod);
        }
    } finally {
        require.cache[jsonStorePath].exports = real;
    }
    assert.deepEqual(seen.sort(), [path.join(root, 'data', 'anonMessages.json'), path.join(root, 'data', 'rssFeeds.json')].sort());
});

test('messaging: anonymous-message attachments are still swept from temp/ in the project root', async () => {
    const helperPath = require.resolve('../features/messaging/anon/helper');
    delete require.cache[helperPath];
    const { sweepStaleTemp } = require(helperPath);
    const realReaddir = fs.promises.readdir;
    const asked = [];
    fs.promises.readdir = async (dir) => { asked.push(dir); throw new Error('no such directory'); };
    try {
        await sweepStaleTemp();
    } finally {
        fs.promises.readdir = realReaddir;
    }
    assert.deepEqual(asked, [path.join(root, 'temp')]);
});

test('direct line: the store still uses data/directLines.json', () => {
    const jsonStorePath = require.resolve('../utils/jsonStore');
    const real = require(jsonStorePath);
    const seen = [];
    require.cache[jsonStorePath].exports = { ...real, createJsonStore: (filePath, def) => { seen.push(filePath); return real.createJsonStore(filePath, def); } };
    try {
        delete require.cache[require.resolve('../features/directLine/store')];
        require('../features/directLine/store');
    } finally {
        require.cache[jsonStorePath].exports = real;
    }
    assert.deepEqual(seen, [path.join(root, 'data', 'directLines.json')]);
});
