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

test('general: the keep-alive store still uses data/keepAliveThreads.json', () => {
    const jsonStorePath = require.resolve('../utils/jsonStore');
    const real = require(jsonStorePath);
    const seen = [];
    require.cache[jsonStorePath].exports = { ...real, createJsonStore: (filePath, def) => { seen.push(filePath); return real.createJsonStore(filePath, def); } };
    try {
        delete require.cache[require.resolve('../features/general/keepAlive/store')];
        require('../features/general/keepAlive/store');
    } finally {
        require.cache[jsonStorePath].exports = real;
    }
    assert.deepEqual(seen, [path.join(root, 'data', 'keepAliveThreads.json')]);
});

// Which json file a module's store is built on, by absolute location.
function storePathsOf(modulePath) {
    const jsonStorePath = require.resolve('../utils/jsonStore');
    const real = require(jsonStorePath);
    const seen = [];
    require.cache[jsonStorePath].exports = { ...real, createJsonStore: (filePath, def) => { seen.push(filePath); return real.createJsonStore(filePath, def); } };
    try {
        delete require.cache[require.resolve(modulePath)];
        require(modulePath);
    } finally {
        require.cache[jsonStorePath].exports = real;
    }
    return seen;
}

test('tickets: the ticket types still live in data/ticketTypes.json', () => {
    assert.deepEqual(storePathsOf('../features/tickets/ticketTypes'), [path.join(root, 'data', 'ticketTypes.json')]);
});

test('shared ticket config: the per-guild ticket settings still live in data/ticketGuildConfig.json', () => {
    assert.deepEqual(storePathsOf('../shared/ticketConfig/guildConfig'), [path.join(root, 'data', 'ticketGuildConfig.json')]);
});

test('shared archive: the archive category setting still lives in data/archiveConfig.json', () => {
    assert.deepEqual(storePathsOf('../shared/archive/config'), [path.join(root, 'data', 'archiveConfig.json')]);
});

test('shared transcript: a large attachment batch is still staged under temp/transcript-* in the project root', async () => {
    const modulePath = require.resolve('../shared/transcript');
    delete require.cache[modulePath];
    const { postAttachmentGroups } = require(modulePath);
    const staged = [];
    const big = { name: 'big.bin', url: 'https://example.invalid/big.bin', size: 40 * 1024 * 1024 };
    await postAttachmentGroups({ guild: {}, send: async () => ({}) }, [{ label: 'g', files: [big] }], {
        header: false,
        retryBaseMs: 1,
        download: async (url, dest) => { staged.push(dest); throw new Error('stop here'); },
    });
    assert.ok(staged.length >= 1);
    const workDir = path.dirname(staged[0]);
    assert.equal(path.dirname(workDir), path.join(root, 'temp'));
    assert.match(path.basename(workDir), /^transcript-[0-9a-f-]{36}$/);
});

test('games: the activation queue and schedule settings still live in data/activationQueue.json', () => {
    assert.deepEqual(storePathsOf('../features/games/activation/activationQueue'), [path.join(root, 'data', 'activationQueue.json')]);
});

test('league starter items: class and background data is still read from 5etools-src next to the project folder', async () => {
    const seen = [];
    const dataPath = require.resolve('../features/league/starterItems/equipmentData');
    const realData = require(dataPath);
    require.cache[dataPath].exports = {
        ...realData,
        loadClasses: (dir) => { seen.push(dir); return []; },
        loadBackgrounds: (dir) => { seen.push(dir); return []; },
        loadCategoryIndex: (dir) => { seen.push(dir); return {}; },
    };
    try {
        const commandPath = require.resolve('../features/league/starterItems/command');
        delete require.cache[commandPath];
        const command = require(commandPath);
        command.buildClassChoices();
        await command.backgroundAutocomplete({ options: { getFocused: () => '' }, respond: async () => {} });
    } finally {
        require.cache[dataPath].exports = realData;
        delete require.cache[require.resolve('../features/league/starterItems/command')];
    }
    assert.ok(seen.length >= 2);
    for (const dir of seen) assert.equal(dir, path.join(path.dirname(root), '5etools-src', 'data'));
});

test('league shop: the shop floor and the price overrides still live in data/shopFloor.json and data/priceOverrides.json', () => {
    assert.deepEqual(storePathsOf('../features/league/shop/floor'), [path.join(root, 'data', 'shopFloor.json'), path.join(root, 'data', 'priceOverrides.json')]);
});


test('league downtime: the blueprints, the quotes and the id sequence still live in data/downtime*.json', () => {
    const enginePath = require.resolve('../features/league/downtime/engine');
    const seen = [];
    const real = { read: fs.readFileSync, write: fs.writeFileSync, mkdir: fs.mkdirSync };
    fs.readFileSync = function (p, ...rest) {
        if (typeof p === 'string' && p.endsWith('.json') && p.includes('downtime')) { seen.push(['read', p]); throw new Error('stubbed'); }
        return real.read.call(this, p, ...rest);
    };
    fs.writeFileSync = function (p, ...rest) {
        if (typeof p === 'string' && p.endsWith('.json') && p.includes('downtime')) { seen.push(['write', p]); return; }
        return real.write.call(this, p, ...rest);
    };
    fs.mkdirSync = function (p, ...rest) {
        if (typeof p === 'string' && p.endsWith('.json') && p.includes('downtime')) return undefined;
        return real.mkdir.call(this, p, ...rest);
    };
    const warn = console.warn;
    console.warn = () => {};
    try {
        delete require.cache[enginePath];
        const engine = require(enginePath);
        engine.loadQuotes();
        assert.throws(() => engine.loadBlueprints());
        engine.nextDtaId();
    } finally {
        console.warn = warn;
        fs.readFileSync = real.read; fs.writeFileSync = real.write; fs.mkdirSync = real.mkdir;
        delete require.cache[enginePath];
    }
    const data = (name) => path.join(root, 'data', name);
    assert.deepEqual(seen, [
        ['read', data('downtimeQuotes.json')],
        ['read', data('downtimeBlueprints.json')],
        ['read', data('downtimeSequence.json')],
        ['write', data('downtimeSequence.json')],
    ]);
});

test('league quests: the quest reward drafts still live in data/questRewardDrafts.json', () => {
    assert.deepEqual(storePathsOf('../features/league/quests/drafts'), [path.join(root, 'data', 'questRewardDrafts.json')]);
});
