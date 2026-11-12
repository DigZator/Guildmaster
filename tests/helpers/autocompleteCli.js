// Child process: fires an autocomplete interaction for EVERY command, subcommand and option through the real
// routers and prints what happened (which handler ran, what was offered as choices). Handlers and data sources are
// replaced by recorders with distinctive data, so each branch of the routing leaves its own fingerprint.
// Offline: network blocked, Notion stubbed, filesystem writes no-ops.
require('./env');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { testEnv } = require('./env');
const { root } = require('./repo');

const offline = () => { throw new Error('offline (test)'); };
globalThis.fetch = () => Promise.reject(new Error('offline (test)'));
for (const name of ['http', 'https']) { const m = require(name); m.request = offline; m.get = offline; }
for (const fn of ['writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'mkdirSync', 'copyFileSync', 'truncateSync']) fs[fn] = () => undefined;
for (const fn of ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'rmdir', 'mkdir', 'copyFile', 'truncate']) {
    fs[fn] = (...args) => { const cb = args[args.length - 1]; if (typeof cb === 'function') cb(null); };
    fs.promises[fn] = async () => undefined;
}
fs.createWriteStream = offline;
const notionStub = new Proxy(function () {}, { get: (_t, k) => (k === 'then' ? undefined : notionStub), apply: () => Promise.reject(new Error('offline (test)')) });
const originalLoad = Module._load;
Module._load = function (request) {
    if (request === '@notionhq/client') return { Client: function Client() { return notionStub; }, APIErrorCode: {}, LogLevel: {}, isNotionClientError: () => false };
    return originalLoad.apply(this, arguments);
};
console.log = () => {}; console.warn = () => {}; console.error = () => {};

// ── recorders ────────────────────────────────────────────────────────────────
let hits = [];
const req = (rel) => require(path.join(root, rel));
const recordHandler = (mod, name, label) => { mod[name] = async (i) => { hits.push(label || name); await i.respond([{ name: `<${label || name}>`, value: 'x' }]); }; };
const recordChoices = (mod, name, label) => { mod[name] = async () => { hits.push(label || name); return [{ name: `<${label || name}>`, value: 'x' }]; }; };
recordHandler(req('features/games/gameAutoComplete'), 'gameAutocomplete');
recordHandler(req('features/league/starterItems/command'), 'backgroundAutocomplete');
recordHandler(req('commands/leagueQuest'), 'questLinkAutocomplete');
recordHandler(req('commands/leagueQuest'), 'dashboardQuestAutocomplete');
recordHandler(req('utils/downtimeAutoComplete'), 'downtimeActivityAutocomplete');
recordHandler(req('utils/downtimeAutoComplete'), 'downtimeTierAutocomplete');
recordHandler(req('utils/spellAutoComplete'), 'spellAutocomplete');
recordHandler(req('utils/magicItemAutoComplete'), 'magicItemAutocomplete');
recordHandler(req('commands/league'), 'characterLogAutocomplete');
recordHandler(req('commands/league'), 'characterOwnAutocomplete');
recordHandler(req('utils/catalogueAutoComplete'), 'catalogueAutocomplete');
recordChoices(req('utils/inventoryHelper'), 'getItemAutocompleteChoices');
// data the inline branches read, with distinctive values
req('features/messaging/anon/store').getKeys = () => ['alpha-key', 'beta-key'];
req('utils/cache').getCachedGames = async () => [
    { title: 'Open Game', uid: 'u-open', date: '1 Jan', activate: false, createdTime: '2026-01-02' },
    { title: 'Live Game', uid: 'u-live', date: '2 Jan', activate: true, createdTime: '2026-01-01' },
];
req('features/games/activation/activationQueue').getQueue = () => ({ queue: [{ title: 'Queued Game', uid: 'u-queued' }] });
req('features/tickets/ticketTypes').loadTicketTypes = () => [{ key: 'k-one', slug: 's-one', label: 'Label One', buttonEmoji: '🎫' }];

// ── the routers under test ───────────────────────────────────────────────────
const listeners = [];
const client = { on: (ev, fn) => { if (ev === 'interactionCreate') listeners.push(fn); }, user: { id: testEnv.CLIENT_ID } };
require(path.join(root, 'core', 'boot'))(client);   // the router, exactly as index.js starts it

// ── what to fire ─────────────────────────────────────────────────────────────
const definitions = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'snapshots', 'commands.json'), 'utf8')).commands;
const helpData = require(path.join(root, 'helpData'));
const personas = {
    nobody: { roles: [], channel: '300000000000000999' },
    'admin role': { roles: [testEnv.ADMINS_ROLE_ID], channel: '300000000000000999' },
    'control channel only': { roles: [], channel: testEnv.GUILDMASTER_CTRL_CHANNEL_ID },
};
const SUB = 1, GROUP = 2;
function leaves() {
    const out = [];
    for (const cmd of definitions) {
        const subs = (cmd.options || []).filter(o => o.type === SUB || o.type === GROUP);
        if (!subs.length) { out.push({ command: cmd.name, group: null, sub: null, options: (cmd.options || []).map(o => o.name) }); continue; }
        for (const s of subs) {
            if (s.type === SUB) { out.push({ command: cmd.name, group: null, sub: s.name, options: (s.options || []).map(o => o.name) }); continue; }
            for (const t of s.options || []) out.push({ command: cmd.name, group: s.name, sub: t.name, options: (t.options || []).map(o => o.name) });
        }
    }
    return out;
}
const firstHelpGroup = Object.keys(helpData)[0];
const fires = [];
for (const leaf of leaves()) {
    for (const focused of [...leaf.options, 'zz-not-an-option']) {
        fires.push({ ...leaf, focused, helpGroup: null });
        if (leaf.command === 'help' && focused === 'family') fires.push({ ...leaf, focused, helpGroup: firstHelpGroup });
    }
}

function makeInteraction(fire, persona, answers) {
    const options = {
        getSubcommand: (required = true) => { if (fire.sub == null && required) throw new Error('no subcommand'); return fire.sub; },
        getSubcommandGroup: () => fire.group,
        getFocused: (full) => (full ? { name: fire.focused, value: '', type: 3 } : ''),
        getString: (name) => (name === 'group' ? fire.helpGroup : null),
    };
    const member = { id: '400000000000000001', roles: { cache: persona.roles.map(id => ({ id })) }, permissions: { has: () => false } };
    return {
        commandName: fire.command, options, member, user: { id: member.id }, guild: { id: testEnv.GUILD_ID }, guildId: testEnv.GUILD_ID,
        channelId: persona.channel, channel: { id: persona.channel, isThread: () => false },
        isAutocomplete: () => true, isChatInputCommand: () => false, isButton: () => false, isModalSubmit: () => false,
        isStringSelectMenu: () => false, isUserSelectMenu: () => false,
        respond: async (choices) => { answers.push(choices.slice(0, 4).map(c => `${c.name}=${c.value}`).join(',') + (choices.length > 4 ? `,+${choices.length - 4}` : '') || '(empty list)'); },
    };
}

(async () => {
    const entries = [];
    for (const fire of fires) {
        const results = {};
        for (const [pname, persona] of Object.entries(personas)) {
            hits = []; const answers = [];
            let threw = null;
            try { await Promise.all(listeners.map(fn => fn(makeInteraction(fire, persona, answers)))); } catch (e) { threw = e.message; }
            const text = `${hits.length ? hits.join('+') : '(no handler)'} | ${answers.length ? answers.join(' / ') : 'no response'}${threw ? ` | threw: ${threw}` : ''}`;
            (results[text] = results[text] || []).push(pname);
        }
        const route = [fire.command, fire.group, fire.sub].filter(Boolean).join(' ');
        entries.push({ route: `${route}  [focused: ${fire.focused}${fire.helpGroup ? `, group=${fire.helpGroup}` : ''}]`, results });
    }
    process.stdout.write(`AUTOCOMPLETE_JSON_START${JSON.stringify({ personas: Object.keys(personas), entries })}AUTOCOMPLETE_JSON_END\n`, () => process.exit(0));
})().catch(e => { process.stderr.write(String(e && e.stack || e)); process.exit(1); });
