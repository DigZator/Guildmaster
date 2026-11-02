require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { MAPPINGS } = require('../config/mappings');
const mapping = require('../utils/mappingCheck');
const { sourceFiles, read, root } = require('./helpers/repo');
const { stripComments } = require('./helpers/scan');

const GUILD = 'G1';
const TEXT = [ChannelType.GuildText];

function channel(id, { type = ChannelType.GuildText, guildId = GUILD, allow = ['ViewChannel', 'SendMessages'], locked = false, failSend = false } = {}) {
    const sent = [];
    return {
        id, type, guildId, locked, sent,
        permissionsFor: () => ({ has: (flag) => allow.some(name => PermissionFlagsBits[name] === flag) }),
        send: async (payload) => { if (failSend) throw new Error('Missing Permissions'); sent.push(payload); },
    };
}

function fakeClient(channels, { errors = {}, noGuild = false } = {}) {
    const me = { id: 'BOT' };
    const guild = { id: GUILD, members: { me, fetchMe: async () => me } };
    return {
        guilds: { cache: new Map(noGuild ? [] : [[GUILD, guild]]), fetch: async () => { if (noGuild) throw new Error('gone'); return guild; } },
        channels: {
            fetch: async (id) => {
                if (errors[id]) throw Object.assign(new Error('api error'), errors[id]);
                if (channels[id]) return channels[id];
                throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
            },
        },
    };
}

const entry = (key, id, extra = {}) => ({
    key, label: key, tier: 'feature', gate: false, managed: false, skipInDev: false,
    types: TEXT, needs: ['ViewChannel', 'SendMessages'], usedBy: 'something', fix: `fix ${key}`,
    read: () => id, ...extra,
});

const memoryStore = (initial = { signature: '' }) => ({
    state: initial, saves: 0,
    load() { return { ...this.state }; },
    save(next) { this.state = next; this.saves++; },
});
const quietLog = { log() {}, warn() {} };
const statuses = (results) => Object.fromEntries(results.map(r => [r.key, r.status]));

test('every status is detected', async () => {
    const mappings = [
        entry('OK', 'c-ok'),
        entry('UNSET', null),
        entry('GONE', 'c-gone'),
        entry('HIDDEN', 'c-hidden'),
        entry('BADID', 'c-badid'),
        entry('TYPE', 'c-text', { types: [ChannelType.GuildForum] }),
        entry('PERMS', 'c-perms'),
        entry('LOCKED', 'c-locked', { types: [ChannelType.PublicThread], needs: ['ViewChannel'] }),
        entry('OTHERGUILD', 'c-other'),
        entry('BROKEN', null, { read: () => { throw new Error('boom'); } }),
        entry('SKIP', null, { skipInDev: true }),
    ];
    const client = fakeClient({
        'c-ok': channel('c-ok'),
        'c-text': channel('c-text'),
        'c-perms': channel('c-perms', { allow: ['ViewChannel'] }),
        'c-locked': channel('c-locked', { type: ChannelType.PublicThread, locked: true }),
        'c-other': channel('c-other', { guildId: 'OTHER' }),
    }, { errors: { 'c-hidden': { code: 50001 }, 'c-badid': { code: 50035 } } });

    const results = await mapping.checkMappings(client, { mappings, guildId: GUILD, dev: false });
    assert.deepEqual(statuses(results), {
        OK: 'ok', UNSET: 'unset', GONE: 'not_found', HIDDEN: 'no_access', BADID: 'not_found', TYPE: 'wrong_type',
        PERMS: 'no_access', LOCKED: 'no_access', OTHERGUILD: 'wrong_guild', BROKEN: 'error', SKIP: 'unset',
    });
    assert.match(results.find(r => r.key === 'PERMS').detail, /SendMessages/);
    assert.match(results.find(r => r.key === 'TYPE').detail, /GuildText.*GuildForum/);

    const dev = await mapping.checkMappings(client, { mappings, guildId: GUILD, dev: true });
    assert.equal(statuses(dev).SKIP, 'skipped');
});

test('an unavailable server is "unchecked", not a problem', async () => {
    const results = await mapping.checkMappings(fakeClient({}, { noGuild: true }), { mappings: [entry('A', 'x')], guildId: GUILD });
    assert.equal(results[0].status, 'unchecked');
    assert.equal(mapping.severity(results[0]), 'ok');
    assert.equal(mapping.signature(results), '');
});

test('severity: unset core is an error, unset feature a warning', () => {
    const r = (tier, status) => ({ tier, status });
    assert.equal(mapping.severity(r('core', 'unset')), 'error');
    assert.equal(mapping.severity(r('feature', 'unset')), 'warn');
    assert.equal(mapping.severity(r('feature', 'not_found')), 'error');
    assert.equal(mapping.severity(r('core', 'ok')), 'ok');
});

test('signature ignores order, changes with status or id, and is empty when healthy', () => {
    const a = { key: 'A', status: 'unset', id: null, tier: 'feature' };
    const b = { key: 'B', status: 'not_found', id: '1', tier: 'feature' };
    const ok = { key: 'C', status: 'ok', id: '2', tier: 'feature' };
    assert.equal(mapping.signature([a, b, ok]), mapping.signature([ok, b, a]));
    assert.notEqual(mapping.signature([a, b]), mapping.signature([a, { ...b, status: 'no_access' }]));
    assert.notEqual(mapping.signature([a, b]), mapping.signature([a, { ...b, id: '9' }]));
    assert.equal(mapping.signature([ok, { key: 'S', status: 'skipped', id: null }]), '');
});

test('the report names each problem with its fix and stays within Discord limits for the real registry', () => {
    const results = MAPPINGS.map((m, i) => ({
        key: m.key, label: m.label, tier: m.tier, usedBy: m.usedBy, fix: m.fix, id: String(i),
        status: i % 2 ? 'no_access' : 'unset', detail: i % 2 ? 'the bot is missing ViewChannel, SendMessages, ManageChannels' : 'not set',
    }));
    const json = mapping.buildReportEmbed(results).toJSON();
    const fields = json.fields || [];
    assert.ok(fields.length > 0 && fields.length <= 25);
    assert.ok(fields.every(f => f.value.length <= 1024), 'a field exceeds 1024 characters');
    const total = [json.title, json.description, json.footer?.text, ...fields.flatMap(f => [f.name, f.value])].join('').length;
    assert.ok(total <= 6000, `embed is ${total} characters`);
    const text = fields.map(f => f.value).join('\n');
    for (const m of MAPPINGS) assert.ok(text.includes(m.key), `${m.key} missing from the report`);
    assert.ok(text.includes('/ticket config') && text.includes('Set `TRAP_CHANNEL_ID` in .env'));
});

test('first run with problems posts to the control channel and remembers it', async () => {
    const ctrl = channel('ctrl');
    const mappings = [entry('GUILDMASTER_CTRL_CHANNEL_ID', 'ctrl', { tier: 'core' }), entry('TRAP', null)];
    const store = memoryStore();
    const out = await mapping.runMappingCheck(fakeClient({ ctrl }), { mappings, store, log: quietLog, guildId: GUILD, dev: false });
    assert.equal(out.posted, true);
    assert.equal(ctrl.sent.length, 1);
    assert.match(JSON.stringify(ctrl.sent[0].embeds[0].toJSON()), /TRAP/);
    assert.notEqual(store.state.signature, '');
});

test('the same problems are not reported twice', async () => {
    const ctrl = channel('ctrl');
    const mappings = [entry('GUILDMASTER_CTRL_CHANNEL_ID', 'ctrl', { tier: 'core' }), entry('TRAP', null)];
    const store = memoryStore();
    const client = fakeClient({ ctrl });
    const opts = { mappings, store, log: quietLog, guildId: GUILD, dev: false };
    await mapping.runMappingCheck(client, opts);
    const second = await mapping.runMappingCheck(client, opts);
    assert.equal(second.posted, false);
    assert.equal(second.reason, 'unchanged');
    assert.equal(ctrl.sent.length, 1);
});

test('a changed problem set is reported again, and a fixed one gets a single "all good" note', async () => {
    const ctrl = channel('ctrl');
    let trap = null;
    const mappings = [entry('GUILDMASTER_CTRL_CHANNEL_ID', 'ctrl', { tier: 'core' }), entry('TRAP', null, { read: () => trap })];
    const store = memoryStore();
    const client = fakeClient({ ctrl, 'c-trap': channel('c-trap') });
    const opts = { mappings, store, log: quietLog, guildId: GUILD, dev: false };

    await mapping.runMappingCheck(client, opts);
    trap = 'c-gone';
    assert.equal((await mapping.runMappingCheck(client, opts)).posted, true);
    trap = 'c-trap';
    const fixed = await mapping.runMappingCheck(client, opts);
    assert.equal(fixed.posted, true);
    assert.match(JSON.stringify(ctrl.sent.at(-1).embeds[0].toJSON()), /look good now/);
    assert.equal(store.state.signature, '');
    assert.equal((await mapping.runMappingCheck(client, opts)).posted, false);
    assert.equal(ctrl.sent.length, 3);
});

test('a healthy first run is silent', async () => {
    const ctrl = channel('ctrl');
    const out = await mapping.runMappingCheck(fakeClient({ ctrl }), {
        mappings: [entry('GUILDMASTER_CTRL_CHANNEL_ID', 'ctrl', { tier: 'core' })], store: memoryStore(), log: quietLog, guildId: GUILD, dev: false,
    });
    assert.equal(out.posted, false);
    assert.equal(ctrl.sent.length, 0);
});

test('falls back to the bot log when the control channel cannot be posted to', async () => {
    const ctrl = channel('ctrl', { failSend: true });
    const botLog = channel('log');
    const mappings = [entry('GUILDMASTER_CTRL_CHANNEL_ID', 'ctrl', { tier: 'core' }), entry('BOT_LOG_CHANNEL_ID', 'log', { tier: 'core' }), entry('TRAP', null)];
    const out = await mapping.runMappingCheck(fakeClient({ ctrl, log: botLog }), { mappings, store: memoryStore(), log: quietLog, guildId: GUILD, dev: false });
    assert.equal(out.channelId, 'log');
    assert.equal(botLog.sent.length, 1);
});

test('when nothing can be posted it does not throw and retries next start', async () => {
    const ctrl = channel('ctrl', { failSend: true });
    const store = memoryStore();
    const out = await mapping.runMappingCheck(fakeClient({ ctrl }), {
        mappings: [entry('GUILDMASTER_CTRL_CHANNEL_ID', 'ctrl', { tier: 'core' }), entry('TRAP', null)], store, log: quietLog, guildId: GUILD, dev: false,
    });
    assert.equal(out.posted, false);
    assert.equal(out.reason, 'undelivered');
    assert.equal(store.saves, 0);
});

test('in DEV_MODE the report goes to the debugging channel first', async () => {
    const debug = channel('debug');
    const ctrl = channel('ctrl');
    const mappings = [entry('BOT_DEBUGGING_CHANNEL_ID', 'debug'), entry('GUILDMASTER_CTRL_CHANNEL_ID', 'ctrl', { tier: 'core' }), entry('TRAP', null)];
    const out = await mapping.runMappingCheck(fakeClient({ debug, ctrl }), { mappings, store: memoryStore(), log: quietLog, guildId: GUILD, dev: true });
    assert.equal(out.channelId, 'debug');
    assert.equal(ctrl.sent.length, 0);
});

test('init waits for clientReady and never lets a failed check escape', async () => {
    let handler; let events = 0;
    const client = { once: (name, fn) => { events++; assert.equal(name, 'clientReady'); handler = fn; } };
    const brokenStore = { load() { throw new Error('disk'); }, save() {} };
    mapping.init(client, { store: brokenStore, mappings: [entry('A', null)], log: quietLog, guildId: GUILD });
    assert.equal(events, 1);
    const original = console.error; const calls = [];
    console.error = (...args) => calls.push(args);
    try { handler(); await new Promise(resolve => setTimeout(resolve, 30)); } finally { console.error = original; }
    assert.equal(calls.length, 1);
    assert.match(String(calls[0][0]), /Check failed/);
});

test('the real registry validates end to end against a fake server', async () => {
    const live = MAPPINGS.filter(m => !m.managed);
    const saved = Object.fromEntries(live.map(m => [m.key, process.env[m.key]]));
    try {
        const channels = {};
        for (const m of live) {
            process.env[m.key] = `id-${m.key}`;
            channels[`id-${m.key}`] = channel(`id-${m.key}`, { type: m.types[0], allow: m.needs });
        }
        const healthy = await mapping.checkMappings(fakeClient(channels), { mappings: live, guildId: GUILD, dev: false });
        assert.deepEqual(healthy.filter(r => r.status !== 'ok').map(r => `${r.key}:${r.status}`), []);

        delete channels['id-TRAP_CHANNEL_ID'];
        const broken = await mapping.checkMappings(fakeClient(channels), { mappings: live, guildId: GUILD, dev: false });
        assert.deepEqual(broken.filter(r => r.status !== 'ok').map(r => `${r.key}:${r.status}`), ['TRAP_CHANNEL_ID:not_found']);
    } finally {
        for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});

test('registry entries are well formed', () => {
    const seen = new Set();
    for (const m of MAPPINGS) {
        assert.ok(!seen.has(m.key), `duplicate ${m.key}`); seen.add(m.key);
        assert.match(m.key, /^[A-Z][A-Z0-9_]*_(CHANNEL|CATEGORY|FORUM|THREAD)_ID$/);
        assert.ok(['core', 'feature'].includes(m.tier), m.key);
        assert.ok(m.types.length > 0 && m.types.every(t => ChannelType[t] !== undefined), `${m.key} types`);
        assert.ok(m.needs.length > 0 && m.needs.every(n => typeof PermissionFlagsBits[n] === 'bigint'), `${m.key} needs`);
        assert.ok(m.label && m.usedBy && m.fix && typeof m.read === 'function', m.key);
    }
});

test('the permission gates stay in .env and managed entries point at their command', () => {
    const gates = MAPPINGS.filter(m => m.gate).map(m => m.key).sort();
    assert.deepEqual(gates, ['GUILDMASTER_CTRL_CHANNEL_ID', 'LEAGUE_ADMIN_CHANNEL_ID']);
    for (const m of MAPPINGS.filter(m => m.gate)) assert.match(m.fix, /\.env/);
    for (const m of MAPPINGS.filter(m => m.managed)) assert.match(m.fix, /`\/[a-z-]+/);
});

const envReads = new Set();
for (const file of sourceFiles()) {
    for (const m of stripComments(read(file)).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) envReads.add(m[1]);
}
const documented = new Set(
    [...fs.readFileSync(path.join(root, '.env.example'), 'utf8').matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/gm)].map(m => m[1]),
);

test('every channel, category, forum or thread ID the code reads from env is in the registry', () => {
    const registry = new Set(MAPPINGS.map(m => m.key));
    const missing = [...envReads].filter(name => /_(CHANNEL|CATEGORY|FORUM|THREAD)_ID$/.test(name) && !registry.has(name));
    assert.deepEqual(missing, [], 'add these to config/mappings.js so the startup check covers them');
});

test('every env-backed registry entry is actually read by the code', () => {
    const unused = MAPPINGS.filter(m => !m.managed && !envReads.has(m.key)).map(m => m.key);
    assert.deepEqual(unused, []);
});

test('.env.example documents every variable the code reads and every registry key', () => {
    const OS_PROVIDED = new Set(['HOME']);
    const undocumented = [...envReads].filter(name => !OS_PROVIDED.has(name) && !documented.has(name));
    assert.deepEqual(undocumented, [], 'add these to .env.example');
    assert.deepEqual(MAPPINGS.map(m => m.key).filter(key => !documented.has(key)), []);
});
