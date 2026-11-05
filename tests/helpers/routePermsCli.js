// Child process: drives every command / button / select / modal route through the REAL routers
// with fake interactions, once per persona, and reports what each persona gets.
//
// Safety: the network is blocked, @notionhq/client is replaced by a stub that rejects, and every
// filesystem write is a no-op, so a route that gets past its permission check cannot touch Discord,
// Notion or data/. The parent test additionally verifies that data/ was not modified.
//
// Input (stdin): JSON { commands:[{command,group,sub}], buttons:[id], selects:[{id,user}], modals:[id] }
// Output (stdout): ROUTEPERMS_JSON_START ... ROUTEPERMS_JSON_END
require('./env');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { root, loadableFiles } = require('./repo');
const FILES_TO_PRELOAD = loadableFiles(); // listed before the read guards below hide anything

// Extra role ids so role-gated routes outside isAdminChannel can be exercised.
Object.assign(process.env, {
    CLERK_OF_MORTAL_AFFAIRS_ROLE_ID: '200000000000000004',
    CLANKERS_ROLE_ID: '200000000000000005',
    DM_ROLE_ID: '200000000000000006',
    LEAGUE_PLAYERS_ROLE_ID: '200000000000000007',
    ADVENTURER_ROLE_ID: '200000000000000008',
});
const E = process.env;

// ---- guards ------------------------------------------------------------------------------
const offline = () => { throw new Error('offline (test)'); };
globalThis.fetch = () => Promise.reject(new Error('offline (test)'));
for (const name of ['http', 'https']) { const m = require(name); m.request = offline; m.get = offline; }
for (const fn of ['writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'mkdirSync', 'copyFileSync', 'truncateSync']) fs[fn] = () => undefined;
for (const fn of ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'rmdir', 'mkdir', 'copyFile', 'truncate']) {
    fs[fn] = (...args) => { const cb = args[args.length - 1]; if (typeof cb === 'function') cb(null); };
    fs.promises[fn] = async () => undefined;
}
fs.createWriteStream = offline;

// Hermetic reads: replies must not depend on the machine this runs on. Runtime stores in data/, the real
// .env, and anything else under the home directory (for example ~/5etools-src) look like they do not exist.
// The five tracked data files and everything inside the repo (modules, node_modules) read normally.
const os = require('os');
const TRACKED_DATA = new Set(['channels.js', 'registrationDefaults.js', 'gameFields.json', 'downtimeQuotes.json', 'downtimeBlueprints.json']);
const dataDir = path.join(root, 'data') + path.sep;
const home = os.homedir() + path.sep;
const hidden = (p) => {
    if (typeof p !== 'string') return false;
    const abs = path.resolve(p);
    if (abs === path.join(root, '.env')) return true;
    if (abs.startsWith(dataDir)) return !TRACKED_DATA.has(path.basename(abs));
    return abs.startsWith(home) && !abs.startsWith(root + path.sep);
};
const enoent = (p) => Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT', errno: -2, syscall: 'open', path: p });
for (const fn of ['readFileSync', 'statSync', 'lstatSync', 'accessSync', 'readdirSync', 'openSync']) {
    const real = fs[fn];
    fs[fn] = function (p, ...rest) { if (hidden(p)) throw enoent(p); return real.call(this, p, ...rest); };
}
const realExists = fs.existsSync;
fs.existsSync = (p) => (hidden(p) ? false : realExists(p));
for (const fn of ['readFile', 'stat', 'lstat', 'access', 'readdir']) {
    const real = fs[fn];
    fs[fn] = function (p, ...rest) {
        if (hidden(p)) { const cb = rest[rest.length - 1]; if (typeof cb === 'function') return cb(enoent(p)); }
        return real.call(this, p, ...rest);
    };
    const realP = fs.promises[fn];
    fs.promises[fn] = async function (p, ...rest) { if (hidden(p)) throw enoent(p); return realP.call(this, p, ...rest); };
}

const notionStub = new Proxy(function () {}, {
    get: (_t, k) => (k === 'then' ? undefined : notionStub),
    apply: () => Promise.reject(new Error('offline (test)')),
});
const originalLoad = Module._load;
Module._load = function (request) {
    if (request === '@notionhq/client') {
        return { Client: function Client() { return notionStub; }, APIErrorCode: {}, LogLevel: {}, isNotionClientError: () => false };
    }
    return originalLoad.apply(this, arguments);
};

// ---- permissive stubs (guild, channel, client ... never role/permission data) --------------
function stub() {
    return new Proxy(function () {}, {
        get(_t, p) {
            if (p === 'then') return undefined;
            if (p === Symbol.toPrimitive) return () => '';
            if (p === Symbol.iterator) return function* () {};
            if (p === 'length' || p === 'size') return 0;
            if (p === 'toJSON') return () => null;
            return stub();
        },
        apply() { return stub(); },
    });
}
function withProps(props) {
    const base = stub();
    return new Proxy(base, { get: (t, p) => (p in props ? props[p] : t[p]) });
}

class RoleCache extends Map {
    some(fn) { for (const [k, v] of this) if (fn(v, k, this)) return true; return false; }
    every(fn) { for (const [k, v] of this) if (!fn(v, k, this)) return false; return true; }
    find(fn) { for (const [k, v] of this) if (fn(v, k, this)) return v; return undefined; }
    filter(fn) { const out = new RoleCache(); for (const [k, v] of this) if (fn(v, k, this)) out.set(k, v); return out; }
    map(fn) { return [...this].map(([k, v]) => fn(v, k, this)); }
    first() { return this.values().next().value; }
}

// ---- personas ----------------------------------------------------------------------------
const ELSE = '300000000000000099';
const PERSONAS = [
    { name: 'nobody', roles: [], channel: ELSE },
    { name: 'admins-role', roles: [E.ADMINS_ROLE_ID], channel: ELSE },
    { name: 'hr-role', roles: [E.HR_ROLE_ID], channel: ELSE },
    { name: 'cmd-role', roles: [E.CMD_ROLE_ID], channel: ELSE },
    { name: 'clerk+clankers', roles: [E.CLERK_OF_MORTAL_AFFAIRS_ROLE_ID, E.CLANKERS_ROLE_ID], channel: ELSE },
    { name: 'dm-role', roles: [E.DM_ROLE_ID], channel: ELSE },
    { name: 'player-roles', roles: [E.LEAGUE_PLAYERS_ROLE_ID, E.ADVENTURER_ROLE_ID], channel: ELSE },
    { name: 'discord-administrator', roles: [], channel: ELSE, discordAdmin: true },
    { name: 'nobody@ctrl-channel', roles: [], channel: E.GUILDMASTER_CTRL_CHANNEL_ID },
    { name: 'nobody@league-channel', roles: [], channel: E.LEAGUE_ADMIN_CHANNEL_ID },
    { name: 'admins-role@ctrl-channel', roles: [E.ADMINS_ROLE_ID], channel: E.GUILDMASTER_CTRL_CHANNEL_ID },
];

// ---- record every isAdminChannel call --------------------------------------------------
let gateLog = null;
const iacPath = require.resolve(path.join(root, 'utils/isAdminChannel.js'));
const realIac = require(iacPath);
const wrapped = (interaction, type = 'bot') => {
    try {
        const result = realIac.isAdminChannel(interaction, type);
        if (gateLog) gateLog.push(`${type}=${result}`);
        return result;
    } catch (err) {
        if (gateLog) gateLog.push(`${type}=throws`);
        throw err;
    }
};
require.cache[iacPath].exports = { ...realIac, isAdminChannel: wrapped, ...('isAdmin' in realIac ? { isAdmin: wrapped } : {}) };

// Once a check moves from a handler into the router it is made by shared/auth instead. Record those calls under
// the old type's name so a lifted check shows up in the snapshot exactly as it did before. A policy that never
// had an old type (admin_or_discord_admin) is recorded under its own name.
const auth = require(path.join(root, 'shared/auth'));
const realCan = auth.can;
auth.can = (policyName, interaction, env) => {
    const result = realCan(policyName, interaction, env);
    const policy = auth.POLICIES[policyName];
    const recordedAs = policy && (policy.legacy ?? (policy.combine !== 'open' ? policy.name : null));
    if (recordedAs && gateLog) gateLog.push(`${recordedAs}=${result}`);
    return result;
};

// Load every module up front (with the guards above in place) so that lazy requires inside handlers
// are already cached: a slow first require must not look like a hung route.
for (const file of FILES_TO_PRELOAD) { try { require(path.join(root, file)); } catch { /* the smoke test reports load failures */ } }

// ---- fake interactions -----------------------------------------------------------------
function makeInteraction(kind, spec, persona, rec) {
    const roles = new RoleCache(persona.roles.map(id => [id, { id }]));
    const user = { id: '400000000000000001', tag: 'tester#0001', username: 'tester', bot: false };
    const member = {
        id: user.id, user, displayName: 'tester', roles: { cache: roles },
        permissions: { has: () => Boolean(persona.discordAdmin) },
    };
    const channel = withProps({ id: persona.channel, parentId: null, isThread: () => false, type: 0 });
    const guild = withProps({ id: E.GUILD_ID, ownerId: '0' });
    const record = (label) => async (payload) => {
        rec.replies.push(label === 'reply' || label === 'followUp' || label === 'editReply' || label === 'update'
            ? summarize(payload) : `(${label})`);
        interaction.replied = interaction.replied || label === 'reply';
        interaction.deferred = interaction.deferred || label === 'deferReply' || label === 'deferUpdate';
        return stub();
    };
    const options = {
        getSubcommand: () => spec.sub ?? null,
        getSubcommandGroup: () => spec.group ?? null,
        getFocused: () => '', data: [], resolved: {},
    };
    for (const g of ['String', 'Integer', 'Number', 'Boolean', 'User', 'Member', 'Channel', 'Role', 'Mentionable', 'Attachment']) options['get' + g] = () => null;
    const is = {
        isChatInputCommand: kind === 'command', isButton: kind === 'button', isModalSubmit: kind === 'modal',
        isStringSelectMenu: kind === 'select', isUserSelectMenu: kind === 'user-select',
        isMessageComponent: ['button', 'select', 'user-select'].includes(kind),
    };
    const base = {
        id: '500000000000000001', applicationId: E.CLIENT_ID, type: 2, locale: 'en-US',
        user, member, guild, guildId: E.GUILD_ID, channel, channelId: persona.channel,
        // What Discord reports for the caller in this channel. Without it the catch-all proxy below answers with a
        // truthy stub, so every persona would count as having the Administrator permission.
        memberPermissions: { has: () => Boolean(persona.discordAdmin) },
        customId: spec.customId, commandName: spec.command, options, values: [],
        fields: { getTextInputValue: () => '', getField: () => ({ value: '' }), fields: new Map() },
        message: stub(), component: stub(), replied: false, deferred: false,
        inGuild: () => true, inCachedGuild: () => true, isRepliable: () => true,
        isAutocomplete: () => false,
        reply: record('reply'), followUp: record('followUp'), editReply: record('editReply'),
        update: record('update'), deferReply: record('deferReply'), deferUpdate: record('deferUpdate'),
        showModal: record('showModal'), deleteReply: record('deleteReply'), respond: record('respond'),
    };
    for (const [k, v] of Object.entries(is)) base[k] = () => v;
    const interaction = new Proxy(base, {
        get(t, p) {
            if (p in t) return t[p];
            if (typeof p === 'string' && /^is[A-Z]/.test(p)) return () => false;
            if (p === 'then') return undefined;
            return stub();
        },
        set(t, p, v) { t[p] = v; return true; },
    });
    return interaction;
}

// Discord timestamps (<t:1793626200:t>) depend on today's date; keep them out of snapshot keys.
const stable = (text) => text.replace(/<t:\d+(?::[a-zA-Z])?>/g, '<t:TIME>');

function summarize(payload) {
    if (typeof payload === 'string') return stable(payload).slice(0, 80);
    if (payload && typeof payload.content === 'string' && payload.content) return stable(payload.content.replace(/\s+/g, ' ')).slice(0, 80);
    if (payload && (payload.embeds || payload.components || payload.files)) return '(embed/components)';
    return '(reply)';
}

// ---- drive the real routers --------------------------------------------------------------
const listeners = [];
const client = withProps({ on: (ev, fn) => { if (ev === 'interactionCreate') listeners.push(fn); }, user: { id: E.CLIENT_ID } });
require(path.join(root, 'core', 'boot'))(client);   // the router, exactly as index.js starts it

const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const quiet = { log: console.log, warn: console.warn, error: console.error, info: console.info };

async function fire(kind, spec, persona) {
    const rec = { replies: [], timedOut: false };
    const interaction = makeInteraction(kind, spec, persona, rec);
    gateLog = [];
    for (const k of Object.keys(quiet)) console[k] = () => {};
    try {
        await Promise.race([
            Promise.all(listeners.map(fn => fn(interaction).catch(() => {}))),
            sleep(2000).then(() => { rec.timedOut = true; }),
        ]);
    } finally { for (const k of Object.keys(quiet)) console[k] = quiet[k]; }
    const gates = gateLog; gateLog = null;
    return [
        gates.length ? gates.join(',') : 'no-isAdminChannel-call',
        rec.replies.length ? rec.replies[0] : (rec.timedOut ? '(still running)' : '(no reply)'),
    ].join(' | ');
}

async function characterize(label, kind, spec) {
    const groups = {};
    for (const persona of PERSONAS) {
        const result = await fire(kind, spec, persona);
        (groups[result] = groups[result] || []).push(persona.name);
    }
    return { route: label, results: groups };
}

(async () => {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const out = { personas: PERSONAS.map(p => p.name), commands: [], buttons: [], selects: [], modals: [] };
    for (const c of input.commands) {
        const label = [c.command, c.group, c.sub].filter(Boolean).join(' ');
        out.commands.push(await characterize(label, 'command', c));
    }
    for (const id of input.buttons) out.buttons.push(await characterize(id, 'button', { customId: id }));
    for (const s of input.selects) out.selects.push(await characterize(s.id + (s.user ? ' (user select)' : ''), s.user ? 'user-select' : 'select', { customId: s.id }));
    for (const id of input.modals) out.modals.push(await characterize(id, 'modal', { customId: id }));
    process.stdout.write('ROUTEPERMS_JSON_START\n' + JSON.stringify(out) + '\nROUTEPERMS_JSON_END\n');
    process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
