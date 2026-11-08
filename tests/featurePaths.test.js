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

test('tickets: the store still uses data/tickets.json and data/ticketCounters.json', () => {
    const jsonStorePath = require.resolve('../utils/jsonStore');
    const real = require(jsonStorePath);
    const seen = [];
    require.cache[jsonStorePath].exports = { ...real, createJsonStore: (filePath, def) => { seen.push(filePath); return real.createJsonStore(filePath, def); } };
    try {
        delete require.cache[require.resolve('../features/tickets/store')];
        require('../features/tickets/store');
    } finally {
        require.cache[jsonStorePath].exports = real;
    }
    assert.deepEqual(seen.sort(), [path.join(root, 'data', 'ticketCounters.json'), path.join(root, 'data', 'tickets.json')].sort());
});

// channel file: both locations can be overridden by an environment variable (the dev scripts in test/ do), so the
// default and the override are both pinned.
function freshChannelFile(env, load) {
    const keys = ['CHANNEL_FILE_JOBS_DIR', 'CHANNEL_FILE_PROTECTED_PATH'];
    const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    for (const m of ['jobs', 'guards']) delete require.cache[require.resolve(`../features/channelFile/${m}`)];
    try { return load(); } finally {
        for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
        for (const m of ['jobs', 'guards']) delete require.cache[require.resolve(`../features/channelFile/${m}`)];
    }
}

test('channel file: jobs still live in data/channelFileJobs, and CHANNEL_FILE_JOBS_DIR still overrides it', () => {
    assert.equal(freshChannelFile({}, () => require('../features/channelFile/jobs').JOBS_DIR), path.join(root, 'data', 'channelFileJobs'));
    assert.equal(freshChannelFile({ CHANNEL_FILE_JOBS_DIR: '/tmp/somewhere-else' }, () => require('../features/channelFile/jobs').JOBS_DIR), '/tmp/somewhere-else');
});

test('channel file: the protect list is still data/channelFileProtected.json, and CHANNEL_FILE_PROTECTED_PATH still overrides it', () => {
    const jsonStorePath = require.resolve('../utils/jsonStore');
    const real = require(jsonStorePath);
    const seenWith = (env) => {
        const seen = [];
        require.cache[jsonStorePath].exports = { ...real, createJsonStore: (filePath, def) => { seen.push(filePath); return real.createJsonStore(filePath, def); } };
        try { freshChannelFile(env, () => require('../features/channelFile/guards')); } finally { require.cache[jsonStorePath].exports = real; }
        return seen;
    };
    assert.deepEqual(seenWith({}), [path.join(root, 'data', 'channelFileProtected.json')]);
    assert.deepEqual(seenWith({ CHANNEL_FILE_PROTECTED_PATH: '/tmp/protected-elsewhere.json' }), ['/tmp/protected-elsewhere.json']);
});

test('verification: the settings and the member store still use data/verificationConfig.json and data/verification.json', () => {
    const jsonStorePath = require.resolve('../utils/jsonStore');
    const real = require(jsonStorePath);
    const seen = [];
    require.cache[jsonStorePath].exports = { ...real, createJsonStore: (filePath, def) => { seen.push(filePath); return real.createJsonStore(filePath, def); } };
    try {
        for (const mod of ['../features/verification/config', '../features/verification/store']) {
            delete require.cache[require.resolve(mod)];
            require(mod);
        }
    } finally {
        require.cache[jsonStorePath].exports = real;
    }
    assert.deepEqual(seen.sort(), [path.join(root, 'data', 'verification.json'), path.join(root, 'data', 'verificationConfig.json')].sort());
});

test('the long rest: the dashboard settings and the memorial index still use data/tlrDashboardConfig.json and data/memorialIndex.json', () => {
    const jsonStorePath = require.resolve('../utils/jsonStore');
    const real = require(jsonStorePath);
    const seen = [];
    require.cache[jsonStorePath].exports = { ...real, createJsonStore: (filePath, def) => { seen.push(filePath); return real.createJsonStore(filePath, def); } };
    try {
        for (const mod of ['../features/theLongRest/dashboardConfig', '../features/theLongRest/memorialIndex']) {
            delete require.cache[require.resolve(mod)];
            require(mod);
        }
    } finally {
        require.cache[jsonStorePath].exports = real;
    }
    assert.deepEqual(seen.sort(), [path.join(root, 'data', 'memorialIndex.json'), path.join(root, 'data', 'tlrDashboardConfig.json')].sort());
});
