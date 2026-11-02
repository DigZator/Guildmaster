// data/channelMap.json: loading it into the environment, and the rules for what may be stored in it.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJsonStore } = require('../utils/jsonStore');
const channelMap = require('../utils/channelMap');
const { MAPPINGS } = require('../config/mappings');

const silent = { log() {}, warn() {} };
const memStore = (initial = { channels: {} }) => { let data = JSON.parse(JSON.stringify(initial)); return { load: () => data, save: (d) => { data = JSON.parse(JSON.stringify(d)); }, peek: () => data }; };
const ID = (n) => `4000000000000000${String(n).padStart(2, '0')}`;
const LOG = 'BOT_LOG_CHANNEL_ID';

test('the registry splits into 2 gates, 5 managed mappings and 11 settable ones', () => {
    assert.deepEqual(MAPPINGS.filter(m => m.gate).map(m => m.key).sort(), ['GUILDMASTER_CTRL_CHANNEL_ID', 'LEAGUE_ADMIN_CHANNEL_ID']);
    assert.equal(MAPPINGS.filter(m => m.managed).length, 5);
    assert.equal(channelMap.settableMappings().length, 11);
    assert.ok(!channelMap.settableMappings().some(m => m.gate || m.managed));
});

test('a saved value overrides .env; keys with nothing saved keep their .env value', () => {
    const env = { [LOG]: ID(1), TRAP_CHANNEL_ID: ID(2) };
    const store = memStore({ channels: { [LOG]: { id: ID(9), by: 'u', at: 't' } } });
    channelMap.applyToEnv({ env, store, log: silent });
    assert.equal(env[LOG], ID(9));
    assert.equal(env.TRAP_CHANNEL_ID, ID(2));
});

test('a saved value is used even when .env has nothing', () => {
    const env = {};
    channelMap.applyToEnv({ env, store: memStore({ channels: { FEEDS_CHANNEL_ID: { id: ID(5) } } }), log: silent });
    assert.equal(env.FEEDS_CHANNEL_ID, ID(5));
});

test('permission gates, managed mappings, unknown keys and bad ids are ignored, even if hand-edited in', () => {
    const env = { GUILDMASTER_CTRL_CHANNEL_ID: ID(1), LEAGUE_ADMIN_CHANNEL_ID: ID(2), ARCHIVE_CATEGORY_ID: ID(3) };
    const warnings = [];
    const store = memStore({ channels: {
        GUILDMASTER_CTRL_CHANNEL_ID: { id: ID(90) },
        LEAGUE_ADMIN_CHANNEL_ID: { id: ID(91) },
        ARCHIVE_CATEGORY_ID: { id: ID(92) },
        NOT_A_REAL_KEY: { id: ID(93) },
        [LOG]: { id: 'not-a-number' },
        TRAP_CHANNEL_ID: { id: ID(94) },
    } });
    channelMap.applyToEnv({ env, store, log: { log() {}, warn: (m) => warnings.push(m) } });
    assert.equal(env.GUILDMASTER_CTRL_CHANNEL_ID, ID(1));
    assert.equal(env.LEAGUE_ADMIN_CHANNEL_ID, ID(2));
    assert.equal(env.ARCHIVE_CATEGORY_ID, ID(3));
    assert.equal(env.NOT_A_REAL_KEY, undefined);
    assert.equal(env[LOG], undefined);
    assert.equal(env.TRAP_CHANNEL_ID, ID(94), 'the one valid entry still applies');
    assert.equal(warnings.length, 5);
});

test('a broken file never stops startup: .env is used', () => {
    const env = { [LOG]: ID(1) };
    for (const bad of [null, 'garbage', 42, { channels: 'nope' }, { channels: null }]) {
        channelMap.applyToEnv({ env, store: { load: () => bad, save() {} }, log: silent });
        assert.equal(env[LOG], ID(1));
    }
    channelMap.applyToEnv({ env, store: { load: () => { throw new Error('disk on fire'); }, save() {} }, log: silent });
    assert.equal(env[LOG], ID(1));
});

test('describe: running value, saved value and what the next start will use', () => {
    const env = { [LOG]: ID(1) };
    const store = memStore();
    channelMap.applyToEnv({ env, store, log: silent });
    const opts = { env, store, log: silent };

    let d = channelMap.describe(LOG, opts);
    assert.deepEqual([d.running, d.runningSource, d.saved, d.next, d.pending], [ID(1), 'env', null, ID(1), false]);

    channelMap.setMapping(LOG, ID(7), 'user-1', { store });
    d = channelMap.describe(LOG, opts);
    assert.deepEqual([d.running, d.next, d.nextSource, d.pending], [ID(1), ID(7), 'config', true]);
    assert.equal(d.saved.by, 'user-1');

    // restart
    channelMap.applyToEnv({ env, store, log: silent });
    d = channelMap.describe(LOG, opts);
    assert.deepEqual([d.running, d.runningSource, d.next, d.pending], [ID(7), 'config', ID(7), false]);

    // clearing falls back to the .env value that the override replaced
    assert.equal(channelMap.clearMapping(LOG, { store }), true);
    d = channelMap.describe(LOG, opts);
    assert.deepEqual([d.running, d.next, d.nextSource, d.pending], [ID(7), ID(1), 'env', true]);
    assert.equal(channelMap.clearMapping(LOG, { store }), false, 'nothing left to clear');
});

test('setMapping and clearMapping refuse gates, managed mappings, unknown keys and bad ids', () => {
    const store = memStore();
    for (const key of ['GUILDMASTER_CTRL_CHANNEL_ID', 'LEAGUE_ADMIN_CHANNEL_ID', 'TICKET_CATEGORY_ID', 'NOPE']) {
        assert.throws(() => channelMap.setMapping(key, ID(1), 'u', { store }), /./, key);
        assert.throws(() => channelMap.clearMapping(key, { store }), /./, key);
    }
    assert.throws(() => channelMap.setMapping(LOG, 'abc', 'u', { store }), /valid channel id/);
    assert.deepEqual(store.peek(), { channels: {} }, 'nothing was written');
});

test('works with the real JSON store, and a hand-written plain id also loads', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chanmap-')), 'channelMap.json');
    const store = createJsonStore(file, { channels: {} });
    channelMap.setMapping(LOG, ID(3), 'u', { store, now: () => '2026-01-01T00:00:00.000Z' });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { channels: { [LOG]: { id: ID(3), by: 'u', at: '2026-01-01T00:00:00.000Z' } } });

    fs.writeFileSync(file, JSON.stringify({ channels: { FEEDS_CHANNEL_ID: ID(8) } }));
    const env = {};
    channelMap.applyToEnv({ env, store: createJsonStore(file, { channels: {} }), log: silent });
    assert.equal(env.FEEDS_CHANNEL_ID, ID(8));
});

test('the trap channel is the only mapping that needs a confirmation', () => {
    assert.deepEqual(MAPPINGS.filter(m => m.confirm).map(m => m.key), ['TRAP_CHANNEL_ID']);
});

// index.js loads the map before anything else. That only works if loading the map module itself never pulls in
// a module that reads these variables at load time (data/channels.js and friends).
test('requiring utils/channelMap loads no module that reads channel ids at load time', () => {
    const { spawnSync } = require('child_process');
    const { root } = require('./helpers/repo');
    const script = `
        const before = new Set(Object.keys(require.cache));
        require('./utils/channelMap');
        const root = process.cwd() + require('path').sep;
        const loaded = Object.keys(require.cache).filter(f => f.startsWith(root) && !f.includes('node_modules')).map(f => f.slice(root.length));
        console.log(JSON.stringify(loaded.sort()));`;
    const run = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), ['config/mappings.js', 'utils/channelMap.js', 'utils/jsonStore.js']);
});
