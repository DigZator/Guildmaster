// /config status | set | clear and its confirm button, driven with fake interactions and a fake Discord client.
// Nothing touches data/ (the store is in memory) or the network.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const { testEnv } = require('./helpers/env');
const channelMap = require('../utils/channelMap');
const config = require('../utils/configCommand');
const configEntry = require('../commands/config');
const configButtons = require('../buttons/config');

const ADMIN = testEnv.ADMINS_ROLE_ID;
const ELSEWHERE = '300000000000000999';
const GUILD = testEnv.GUILD_ID;
const ID = (n) => `4000000000000000${String(n).padStart(2, '0')}`;

function memStore() { let data = { channels: {} }; return { load: () => data, save: (d) => { data = JSON.parse(JSON.stringify(d)); }, peek: () => data }; }

// A client whose channels are whatever the test lists; anything else is "unknown channel".
function fakeClient(channels = {}) {
    const sent = [];
    const full = {};
    for (const [id, spec] of Object.entries(channels)) {
        full[id] = { id, guildId: GUILD, type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }), ...spec, send: async (payload) => { if (spec.failSend) throw new Error('cannot send'); sent.push({ id, payload }); } };
    }
    const guild = { id: GUILD, members: { me: {} } };
    return {
        sent,
        guilds: { cache: { get: () => guild }, fetch: async () => guild },
        channels: { fetch: async (id) => { if (!full[id]) throw Object.assign(new Error('Unknown Channel'), { code: 10003 }); return full[id]; } },
    };
}

function fakeInteraction({ sub, key = null, channel = null, roles = [ADMIN], userId = 'U1', customId, focused = '', where = ELSEWHERE } = {}) {
    const calls = { reply: [], editReply: [], update: [], deferReply: 0, respond: [] };
    return {
        calls,
        user: { id: userId },
        member: { roles: { cache: roles.map(id => ({ id })) } },
        channelId: where,
        channel: { id: where },
        customId,
        options: {
            getSubcommand: () => sub,
            getString: (name) => (name === 'key' ? key : null),
            getChannel: () => channel,
            getFocused: () => focused,
        },
        reply: async (p) => { calls.reply.push(p); },
        editReply: async (p) => { calls.editReply.push(p); },
        update: async (p) => { calls.update.push(p); },
        deferReply: async () => { calls.deferReply++; },
        respond: async (c) => { calls.respond.push(c); },
    };
}

const text = (payload) => {
    if (!payload) return '';
    const parts = [payload.content ?? ''];
    for (const e of payload.embeds ?? []) { const j = e.toJSON ? e.toJSON() : e; parts.push(j.title ?? '', j.description ?? '', ...(j.fields ?? []).flatMap(f => [f.name, f.value])); }
    return parts.join('\n');
};
const lastReply = (i) => [...i.calls.editReply, ...i.calls.reply, ...i.calls.update].at(-1);

let store;
test.beforeEach(() => { store = memStore(); channelMap.useStore(store); config.pending.clear(); });
const LOG = 'BOT_LOG_CHANNEL_ID';

test('only the admin role may use any subcommand (nobody, HR and CMD are refused)', async () => {
    const client = fakeClient({ [ID(1)]: {} });
    for (const roles of [[], [testEnv.HR_ROLE_ID], [testEnv.CMD_ROLE_ID]]) {
        for (const sub of ['status', 'set', 'clear']) {
            const i = fakeInteraction({ sub, roles, key: LOG, channel: { id: ID(1) } });
            await configEntry(i, client);
            assert.match(text(i.calls.reply[0]), /do not have permission/, `${sub} as ${roles}`);
            assert.equal(i.calls.deferReply, 0);
        }
    }
    assert.deepEqual(store.peek(), { channels: {} });
});

test('standing in the control or league-admin channel is not enough: the admin role is required', async () => {
    const client = fakeClient({ [ID(1)]: {} });
    for (const where of [testEnv.GUILDMASTER_CTRL_CHANNEL_ID, testEnv.LEAGUE_ADMIN_CHANNEL_ID]) {
        for (const sub of ['status', 'set', 'clear']) {
            const i = fakeInteraction({ sub, roles: [], where, key: LOG, channel: { id: ID(1) } });
            await configEntry(i, client);
            assert.match(text(i.calls.reply[0]), /do not have permission/, `${sub} in ${where}`);
        }
        const ac = fakeInteraction({ sub: 'set', roles: [], where });
        await config.autocomplete(ac);
        assert.deepEqual(ac.calls.respond[0], []);
    }
    assert.deepEqual(store.peek(), { channels: {} });
});

test('set saves a healthy channel, says a restart is needed, and writes the audit line to the bot log', async () => {
    const client = fakeClient({ [testEnv.BOT_LOG_CHANNEL_ID]: {}, [ID(1)]: {} });
    const i = fakeInteraction({ sub: 'set', key: 'FEEDS_CHANNEL_ID', channel: { id: ID(1) } });
    await configEntry(i, client);
    assert.equal(store.peek().channels.FEEDS_CHANNEL_ID.id, ID(1));
    assert.equal(store.peek().channels.FEEDS_CHANNEL_ID.by, 'U1');
    assert.match(text(lastReply(i)), /Mapping saved/);
    assert.match(text(lastReply(i)), /restarts/);
    const audited = client.sent.find(s => s.id === testEnv.BOT_LOG_CHANNEL_ID);
    assert.ok(audited, 'audit line reached the bot log');
    assert.match(text(audited.payload), /FEEDS_CHANNEL_ID/);
    assert.match(text(audited.payload), /<@U1>/);
});

test('set refuses a channel that fails the mapping check and saves nothing', async () => {
    const client = fakeClient({ [ID(1)]: { type: ChannelType.GuildVoice }, [ID(2)]: { guildId: 'other-guild' }, [ID(3)]: { permissionsFor: () => ({ has: () => false }) } });
    for (const [id, expected] of [[ID(1), /expected/], [ID(2), /different server/], [ID(3), /missing/], [ID(4), /no longer exists/]]) {
        const i = fakeInteraction({ sub: 'set', key: 'FEEDS_CHANNEL_ID', channel: { id } });
        await configEntry(i, client);
        assert.match(text(lastReply(i)), /Not saved/);
        assert.match(text(lastReply(i)), expected);
    }
    assert.deepEqual(store.peek(), { channels: {} });
});

test('set refuses permission gates, managed mappings and unknown keys', async () => {
    const client = fakeClient({ [ID(1)]: {} });
    for (const [key, expected] of [['GUILDMASTER_CTRL_CHANNEL_ID', /permission gate/], ['LEAGUE_ADMIN_CHANNEL_ID', /permission gate/], ['TICKET_CATEGORY_ID', /managed by another command/], ['NOPE', /not a known mapping/], [null, /Pick a mapping/]]) {
        const i = fakeInteraction({ sub: 'set', key, channel: { id: ID(1) } });
        await configEntry(i, client);
        assert.match(text(lastReply(i)), expected, String(key));
    }
    assert.deepEqual(store.peek(), { channels: {} });
});

test('setting the same value again changes nothing', async () => {
    const client = fakeClient({ [testEnv.BOT_LOG_CHANNEL_ID]: {} });
    const i = fakeInteraction({ sub: 'set', key: LOG, channel: { id: testEnv.BOT_LOG_CHANNEL_ID } });
    await configEntry(i, client);
    assert.match(text(lastReply(i)), /Nothing to change/);
    assert.deepEqual(store.peek(), { channels: {} });
});

test('the trap channel is not saved until the same admin presses Confirm', async () => {
    const client = fakeClient({ [testEnv.BOT_LOG_CHANNEL_ID]: {}, [ID(1)]: {} });
    const i = fakeInteraction({ sub: 'set', key: 'TRAP_CHANNEL_ID', channel: { id: ID(1) } });
    await configEntry(i, client);
    assert.deepEqual(store.peek(), { channels: {} }, 'nothing saved yet');
    const reply = lastReply(i);
    assert.match(text(reply), /kicked from the server, admins included/);
    const buttons = reply.components[0].toJSON().components.map(c => c.custom_id);
    assert.equal(buttons.length, 2);
    const [confirmId, cancelId] = buttons;
    assert.match(confirmId, /^config:confirm:/);
    assert.match(cancelId, /^config:cancel:/);

    // somebody else pressing it is refused
    const other = fakeInteraction({ customId: confirmId, userId: 'U2' });
    await configButtons.prefix['config:'](other, client);
    assert.match(text(other.calls.reply[0]), /Only the person who ran/);
    assert.deepEqual(store.peek(), { channels: {} });

    // the same person without the admin role any more is refused
    const demoted = fakeInteraction({ customId: confirmId, roles: [] });
    await configButtons.prefix['config:'](demoted, client);
    assert.match(text(demoted.calls.reply[0]), /do not have permission/);
    assert.deepEqual(store.peek(), { channels: {} });

    // the same admin confirms
    const press = fakeInteraction({ customId: confirmId });
    await configButtons.prefix['config:'](press, client);
    assert.equal(store.peek().channels.TRAP_CHANNEL_ID.id, ID(1));
    assert.match(text(press.calls.update[0]), /Mapping saved/);
    assert.ok(client.sent.some(s => /TRAP_CHANNEL_ID/.test(text(s.payload))), 'audited');

    // a used token cannot be replayed
    const replay = fakeInteraction({ customId: confirmId });
    await configButtons.prefix['config:'](replay, client);
    assert.match(text(replay.calls.update[0]), /expired/);
});

test('Cancel changes nothing, and an expired confirmation is refused', async () => {
    const client = fakeClient({ [ID(1)]: {} });
    const i = fakeInteraction({ sub: 'set', key: 'TRAP_CHANNEL_ID', channel: { id: ID(1) } });
    await configEntry(i, client);
    const [confirmId, cancelId] = lastReply(i).components[0].toJSON().components.map(c => c.custom_id);

    const cancel = fakeInteraction({ customId: cancelId });
    await configButtons.prefix['config:'](cancel, client);
    assert.match(text(cancel.calls.update[0]), /Cancelled/);
    assert.deepEqual(store.peek(), { channels: {} });

    const i2 = fakeInteraction({ sub: 'set', key: 'TRAP_CHANNEL_ID', channel: { id: ID(1) } });
    await configEntry(i2, client);
    const token = lastReply(i2).components[0].toJSON().components[0].custom_id.split(':')[2];
    config.pending.get(token).expires = Date.now() - 1;
    const late = fakeInteraction({ customId: `config:confirm:${token}` });
    await configButtons.prefix['config:'](late, client);
    assert.match(text(late.calls.update[0]), /expired/);
    assert.deepEqual(store.peek(), { channels: {} });
    assert.ok(confirmId);
});

test('the audit line falls back to the control channel, and a failed audit never fails the command', async () => {
    const down = fakeClient({ [testEnv.BOT_LOG_CHANNEL_ID]: { failSend: true }, [testEnv.GUILDMASTER_CTRL_CHANNEL_ID]: {}, [ID(1)]: {} });
    await configEntry(fakeInteraction({ sub: 'set', key: 'FEEDS_CHANNEL_ID', channel: { id: ID(1) } }), down);
    assert.ok(down.sent.some(s => s.id === testEnv.GUILDMASTER_CTRL_CHANNEL_ID));

    channelMap.useStore(store = memStore());
    const none = fakeClient({ [ID(1)]: {} });
    const i = fakeInteraction({ sub: 'set', key: 'FEEDS_CHANNEL_ID', channel: { id: ID(1) } });
    await configEntry(i, none);
    assert.equal(store.peek().channels.FEEDS_CHANNEL_ID.id, ID(1));
    assert.match(text(lastReply(i)), /Mapping saved/);
});

test('clear removes a saved override and says what the next start will use', async () => {
    const client = fakeClient({ [testEnv.BOT_LOG_CHANNEL_ID]: {} });
    channelMap.setMapping(LOG, ID(7), 'U1', { store });
    const i = fakeInteraction({ sub: 'clear', key: LOG });
    await configEntry(i, client);
    assert.deepEqual(store.peek(), { channels: {} });
    assert.match(text(lastReply(i)), /Override removed/);
    assert.match(text(lastReply(i)), /restarts/);
    assert.ok(client.sent.some(s => /cleared/.test(text(s.payload))));

    const again = fakeInteraction({ sub: 'clear', key: LOG });
    await configEntry(again, client);
    assert.match(text(lastReply(again)), /no saved override/);
});

test('clear refuses gates, managed mappings and unknown keys', async () => {
    for (const key of ['GUILDMASTER_CTRL_CHANNEL_ID', 'TICKET_CATEGORY_ID', 'NOPE']) {
        const i = fakeInteraction({ sub: 'clear', key });
        await configEntry(i, fakeClient());
        assert.match(text(lastReply(i)), /^❌/, key);
    }
});

test('status lists all 18 mappings, shows health and marks changes waiting for a restart', async () => {
    const client = fakeClient({ [testEnv.TRAP_CHANNEL_ID]: {}, [testEnv.BOT_LOG_CHANNEL_ID]: {}, [testEnv.GUILDMASTER_CTRL_CHANNEL_ID]: {}, [testEnv.LEAGUE_ADMIN_CHANNEL_ID]: {} });
    channelMap.setMapping('FEEDS_CHANNEL_ID', ID(5), 'U1', { store });
    const i = fakeInteraction({ sub: 'status' });
    await configEntry(i, client);
    const out = text(lastReply(i));
    const { MAPPINGS } = require('../config/mappings');
    for (const m of MAPPINGS) assert.ok(out.includes(`\`${m.key}\``), `${m.key} listed`);
    assert.ok(out.includes(`after restart: <#${ID(5)}>`), 'the saved channel is shown as waiting for a restart');
    assert.match(out, /1 saved change\(s\) will apply after the next restart/);
    assert.match(out, /permission gate/);
    assert.match(out, /managed by another command/);
});

test('autocomplete: admins see settable keys only, filtered by what they type; others see nothing', async () => {
    const admin = fakeInteraction({ sub: 'set' });
    await config.autocomplete(admin);
    const all = admin.calls.respond[0];
    assert.equal(all.length, 11);
    assert.ok(!all.some(c => /GUILDMASTER_CTRL|LEAGUE_ADMIN|TICKET|ARCHIVE_CATEGORY/.test(c.value)));
    assert.ok(all.every(c => c.name.length <= 100));

    const filtered = fakeInteraction({ sub: 'set', focused: 'feed' });
    await config.autocomplete(filtered);
    assert.deepEqual(filtered.calls.respond[0].map(c => c.value), ['FEEDS_CHANNEL_ID']);

    channelMap.setMapping(LOG, ID(7), 'U1', { store });
    const clear = fakeInteraction({ sub: 'clear' });
    await config.autocomplete(clear);
    assert.deepEqual(clear.calls.respond[0].map(c => c.value), [LOG], 'clear only offers saved overrides');

    const nobody = fakeInteraction({ sub: 'set', roles: [] });
    await config.autocomplete(nobody);
    assert.deepEqual(nobody.calls.respond[0], []);
});
