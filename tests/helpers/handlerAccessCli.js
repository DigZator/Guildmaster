// Child process: calls the three handler-level access checks (ticket staff, /config confirm buttons, direct line buttons) as
// different people and prints what each one decided. Same safety as manifestsCli.js: offline, Notion stubbed, writes no-ops.
require('./env');
const fs = require('fs');
const Module = require('module');

const offline = () => { throw new Error('offline (test)'); };
globalThis.fetch = () => Promise.reject(new Error('offline (test)'));
for (const name of ['http', 'https']) { const m = require(name); m.request = offline; m.get = offline; }
for (const fn of ['writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'mkdirSync', 'copyFileSync', 'truncateSync']) fs[fn] = () => undefined;
for (const fn of ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'rmdir', 'mkdir', 'copyFile', 'truncate']) {
    fs[fn] = (...args) => { const cb = args[args.length - 1]; if (typeof cb === 'function') cb(null); };
    fs.promises[fn] = async () => undefined;
}
fs.createWriteStream = offline;
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
console.log = () => {}; console.warn = () => {};   // keep stdout clean for the JSON below

const { testEnv: E } = require('./env');
class RoleCache extends Map { some(fn) { for (const [k, v] of this) if (fn(v, k, this)) return true; return false; } }
const ELSE = '300000000000000099';
const PERSONAS = [
    { name: 'nobody', roles: [], channel: ELSE },
    { name: 'admins-role', roles: [E.ADMINS_ROLE_ID], channel: ELSE },
    { name: 'hr-role', roles: [E.HR_ROLE_ID], channel: ELSE },
    { name: 'cmd-role', roles: [E.CMD_ROLE_ID], channel: ELSE },
    { name: 'nobody@ctrl-channel', roles: [], channel: E.GUILDMASTER_CTRL_CHANNEL_ID },
    { name: 'admins-role@ctrl-channel', roles: [E.ADMINS_ROLE_ID], channel: E.GUILDMASTER_CTRL_CHANNEL_ID },
    { name: 'discord-administrator', roles: [], channel: ELSE, discordAdmin: true },
];
function interactionFor(persona, extra) {
    const replies = [];
    const say = async (p) => { replies.push(String(p?.content ?? '').slice(0, 40)); };
    return {
        replies,
        user: { id: 'u1' },
        member: { roles: { cache: new RoleCache(persona.roles.map(id => [id, { id }])) } },
        memberPermissions: { has: () => Boolean(persona.discordAdmin) },
        channelId: persona.channel,
        channel: { id: persona.channel, isThread: () => false },
        reply: say, update: say, editReply: say, deferUpdate: async () => {},
        ...extra,
    };
}

(async () => {
    const out = {};
    const tickets = require('../../features/tickets/permissions');
    out.ticketStaff = Object.fromEntries(PERSONAS.map(p => [p.name, tickets.isTicketStaff(interactionFor(p), { type: 'no-such-type' })]));

    const configCommand = require('../../features/config/configCommand');
    const configButton = require('../../features/config/buttons').prefix['config:'];
    out.configConfirmButton = {};
    for (const p of PERSONAS) {
        configCommand.pending.set('tok', { userId: 'u1', expiresAt: Date.now() + 60000 });
        const i = interactionFor(p, { customId: 'config:cancel:tok' });
        await configButton(i, {});
        configCommand.pending.delete('tok');
        out.configConfirmButton[p.name] = i.replies;
    }

    const store = require('../../features/directLine/store');
    store.getDirectLineById = () => ({ id: 'dl1', status: 'open' });
    const dlButton = require('../../features/directLine/buttons').prefix['dl:'];
    out.directLineButton = {};
    for (const p of PERSONAS) {
        const i = interactionFor(p, { customId: 'dl:dl1:unwired' });
        await dlButton(i);
        out.directLineButton[p.name] = i.replies;
    }
    process.stdout.write(`ACCESS_JSON_START${JSON.stringify(out)}ACCESS_JSON_END\n`, () => process.exit(0));
})().catch((e) => { process.stderr.write(String(e.stack) + '\n'); process.exit(1); });
