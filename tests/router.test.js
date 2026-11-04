// core/registry.js and core/router.js (Phase 3, step 1: built but not wired into the bot yet).
// The "legacy parity" tests pin the per-kind behavior the four old routers have today (log labels, reply
// texts, silent vs warned), because the routers get switched over one at a time in later steps.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistry, inspect } = require('../core/registry');
const { createRouter, DEFAULT_DENIED } = require('../core/router');
const { route, routes } = require('../core/manifest');
const { testEnv } = require('./helpers/env');

const ADMIN = testEnv.ADMINS_ROLE_ID;
const log = () => {
    const out = { warn: [], error: [] };
    const w = console.warn, e = console.error;
    console.warn = (...a) => out.warn.push(a.map(String).join(' '));
    console.error = (...a) => out.error.push(a.map(String).join(' '));
    out.restore = () => { console.warn = w; console.error = e; };
    return out;
};
async function quiet(fn) { const l = log(); try { await fn(l); } finally { l.restore(); } }

function fake({ kind = 'button', customId, commandName, group = null, sub = null, guild = true, roles = [], replied = false, deferred = false, failReply = false } = {}) {
    const calls = [];
    const is = (k) => () => kind === k;
    const i = {
        calls, customId, commandName, replied, deferred,
        guild: guild ? { id: 'g' } : null,
        member: { roles: { cache: roles.map(id => ({ id })) } },
        channel: { id: '300000000000000999' },
        isAutocomplete: is('autocomplete'), isChatInputCommand: is('command'), isButton: is('button'),
        isModalSubmit: is('modal'), isStringSelectMenu: is('select'), isUserSelectMenu: is('userSelect'),
        options: { getSubcommandGroup: () => group, getSubcommand: () => sub },
        reply: async (p) => { if (failReply) throw new Error('reply failed'); calls.push(['reply', p]); },
        followUp: async (p) => { if (failReply) throw new Error('reply failed'); calls.push(['followUp', p]); },
        respond: async (c) => calls.push(['respond', c]),
    };
    return i;
}

const ok = () => {};
const base = (extra = {}) => ({ name: 't', ...extra });

// ── registry ──────────────────────────────────────────────────────────────────
test('a well-formed manifest builds a registry', () => {
    const r = createRegistry([base({ commands: [{ name: 'ping', policy: 'open', handler: ok }], buttons: { exact: { a: route('admin', ok) }, prefix: { 'b:': route('open', ok) } } })]);
    assert.ok(r.commands.has('ping'));
    assert.ok(r.tables.button.exact.has('a'));
});

test('every kind of mistake is reported together, not one at a time', () => {
    const { problems, registry } = inspect([
        base({ name: 'one', buttons: { exact: { dup: route('admin', ok), nopol: { handler: ok }, bad: route('adimn', ok), nofn: { policy: 'open' } }, prefix: { 'x:': route('open', ok), 'x:y:': route('open', ok) } } }),
        base({ name: 'two', buttons: { exact: { dup: route('open', ok), 'x:exact': route('open', ok) } }, commands: [{ name: 'c', policy: 'open', handler: ok }, { name: 'c', policy: 'open', handler: ok }] }),
        base({ name: 'three', commands: [{ name: 'd', policy: 'open', handler: ok, subcommands: { 'a b': { policy: 'nope' } }, autocomplete: [{ handle: ok }] }] }),
    ]);
    assert.equal(registry, null);
    const text = problems.join('\n');
    assert.ok(problems.some(p => p.startsWith('one button exact "nopol": no policy')), 'a route without a policy is named');
    for (const needle of ['"dup"', 'no policy', 'unknown policy "adimn"', 'no handler function', 'shorter prefix "x:"', 'also starts with the prefix "x:"', 'command "c"', 'unknown policy "nope"', 'autocomplete #1']) {
        assert.match(text, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), needle);
    }
});

test('createRegistry throws one error that lists every problem', () => {
    assert.throws(() => createRegistry([base({ buttons: { exact: { a: { handler: ok }, b: { handler: ok } } } })]), /2 problem\(s\)[\s\S]*"a"[\s\S]*"b"/);
});

test('the same id in different kinds is fine (button, modal, select and userSelect are separate tables)', () => {
    const r = createRegistry([base({ buttons: { exact: { 'questDash:x': route('open', ok) } }, modals: { exact: { 'questDash:x': route('open', ok) } }, selects: { exact: { 'questDash:x': route('open', ok) } }, userSelects: { exact: { 'questDash:x': route('open', ok) } } })]);
    assert.equal(Object.values(r.tables).filter(t => t.exact.has('questDash:x')).length, 4);
});

test('route() and routes() attach the policy', () => {
    assert.deepEqual(route('hr', ok, { denied: 'no' }), { policy: 'hr', handler: ok, denied: 'no' });
    const t = routes('cmd', { a: ok, b: ok });
    assert.equal(t.a.policy, 'cmd'); assert.equal(t.b.handler, ok);
});

// ── routing ──────────────────────────────────────────────────────────────────
const make = (m) => createRouter(createRegistry([base(m)]));

test('an exact id wins over a prefix lookup, and a prefix matches by start', async () => {
    const hit = [];
    const r = make({ buttons: { exact: { 'a:exact': route('open', () => hit.push('exact')) }, prefix: { 'b:': route('open', () => hit.push('prefix')) } } });
    await r.handle(fake({ customId: 'a:exact' }));
    await r.handle(fake({ customId: 'b:123' }));
    assert.deepEqual(hit, ['exact', 'prefix']);
});

test('handlers receive (interaction, client)', async () => {
    let got;
    const r = make({ buttons: { exact: { a: route('open', (...args) => { got = args; }) } } });
    const i = fake({ customId: 'a' }); await r.handle(i, 'CLIENT');
    assert.deepEqual(got, [i, 'CLIENT']);
});

test('legacy parity, unmatched: button warns, select is silent, modal warns and answers', async () => quiet(async (l) => {
    const r = make({});
    const b = fake({ customId: 'nope' }); await r.handle(b);
    assert.deepEqual(l.warn, ['Unhandled button: nope']); assert.equal(b.calls.length, 0);
    const s = fake({ kind: 'select', customId: 'nope' }); await r.handle(s);
    const u = fake({ kind: 'userSelect', customId: 'nope' }); await r.handle(u);
    assert.equal(s.calls.length + u.calls.length, 0); assert.equal(l.warn.length, 1);
    const m = fake({ kind: 'modal', customId: 'nope' }); await r.handle(m);
    assert.equal(l.warn[1], '[modalHandler] Unhandled modal submission: nope');
    assert.deepEqual(m.calls, [['reply', { content: '❌ This form isn\'t wired up yet.', flags: 64 }]]);
}));

test('legacy parity, unmatched modal that was already answered gets no second reply', async () => quiet(async () => {
    const m = fake({ kind: 'modal', customId: 'nope', deferred: true }); await make({}).handle(m);
    assert.equal(m.calls.length, 0);
}));

test('legacy parity, unknown command is silent; commands only run in a server; other interactions are ignored', async () => {
    const r = make({ commands: [{ name: 'ping', policy: 'open', handler: () => { throw new Error('should not run'); } }] });
    const none = fake({ kind: 'command', commandName: 'ghost' }); await r.handle(none);
    const dm = fake({ kind: 'command', commandName: 'ping', guild: false }); await r.handle(dm);
    await r.handle(fake({ kind: 'other', customId: 'x' }));
    assert.equal(none.calls.length + dm.calls.length, 0);
});

test('a string select and a user select with the same id reach different handlers', async () => {
    const hit = [];
    const r = make({ selects: { prefix: { 'questDash:': route('open', () => hit.push('select')) } }, userSelects: { prefix: { 'questDash:': route('open', () => hit.push('user')) } } });
    await r.handle(fake({ kind: 'select', customId: 'questDash:1' }));
    await r.handle(fake({ kind: 'userSelect', customId: 'questDash:1' }));
    assert.deepEqual(hit, ['select', 'user']);
});

test('falseMeansUnhandled: a modal handler returning false counts as unhandled; others do not', async () => quiet(async (l) => {
    const r = make({ modals: { exact: { a: route('open', () => false, { falseMeansUnhandled: true }), b: route('open', () => false) } } });
    const a = fake({ kind: 'modal', customId: 'a' }); await r.handle(a);
    const b = fake({ kind: 'modal', customId: 'b' }); await r.handle(b);
    assert.equal(a.calls.length, 1); assert.equal(b.calls.length, 0);
    assert.deepEqual(l.warn, ['[modalHandler] Unhandled modal submission: a']);
}));

// ── policy enforcement ───────────────────────────────────────────────────────
test('a route the caller fails is refused with its own text (or the default) and the handler never runs', async () => {
    let ran = 0;
    const r = make({
        buttons: { exact: { a: route('admin', () => ran++, { denied: 'Admins only.' }), b: route('admin', () => ran++) } },
        modals: { exact: { m: route('hr', () => ran++, { denied: 'HR only.' }) } },
        commands: [{ name: 'c', policy: 'cmd', handler: () => ran++ }],
    });
    const a = fake({ customId: 'a' }); await r.handle(a);
    const b = fake({ customId: 'b' }); await r.handle(b);
    const m = fake({ kind: 'modal', customId: 'm' }); await r.handle(m);
    const c = fake({ kind: 'command', commandName: 'c' }); await r.handle(c);
    assert.equal(ran, 0);
    assert.deepEqual(a.calls, [['reply', { content: 'Admins only.', flags: 64 }]]);
    assert.equal(b.calls[0][1].content, DEFAULT_DENIED);
    assert.equal(m.calls[0][1].content, 'HR only.');
    assert.equal(c.calls[0][1].content, DEFAULT_DENIED);
});

test('a caller who passes the policy reaches the handler', async () => {
    let ran = 0;
    const r = make({ buttons: { exact: { a: route('admin', () => ran++) } } });
    await r.handle(fake({ customId: 'a', roles: [ADMIN] }));
    assert.equal(ran, 1);
});

test('a refusal after the interaction was deferred uses a follow-up (a modal sends nothing, like its old router)', async () => {
    const r = make({ buttons: { exact: { a: route('admin', ok) } }, modals: { exact: { m: route('admin', ok) } } });
    const a = fake({ customId: 'a', deferred: true }); await r.handle(a);
    const m = fake({ kind: 'modal', customId: 'm', deferred: true }); await r.handle(m);
    assert.equal(a.calls[0][0], 'followUp'); assert.equal(m.calls.length, 0);
});

test('a subcommand policy overrides the command policy; groups are written "group sub"', async () => {
    let ran = [];
    const r = make({ commands: [{ name: 'channel_file', policy: 'admin', handler: () => ran.push('run'), subcommands: { file: { policy: 'cmd', denied: 'CMD only.' }, 'protect add': { policy: 'open' } } }] });
    const file = fake({ kind: 'command', commandName: 'channel_file', sub: 'file' }); await r.handle(file);
    const protect = fake({ kind: 'command', commandName: 'channel_file', group: 'protect', sub: 'add' }); await r.handle(protect);
    const other = fake({ kind: 'command', commandName: 'channel_file', sub: 'list' }); await r.handle(other);
    assert.equal(file.calls[0][1].content, 'CMD only.');
    assert.equal(ran.length, 1);                         // only "protect add" (open) ran
    assert.equal(other.calls[0][1].content, DEFAULT_DENIED);  // falls back to the command policy (admin)
});

test('autocomplete: first matching entry runs; a caller who fails its policy gets an empty list; no match is silent', async () => {
    const hit = [];
    const r = make({ commands: [{ name: 'c', policy: 'admin', handler: ok, autocomplete: [
        { policy: 'admin', when: (i) => i.customId === 'one', handle: () => hit.push('one') },
        { policy: 'open', handle: () => hit.push('fallback') },
    ] }] });
    const denied = fake({ kind: 'autocomplete', commandName: 'c', customId: 'one' }); await r.handle(denied);
    assert.deepEqual(denied.calls, [['respond', []]]);
    await r.handle(fake({ kind: 'autocomplete', commandName: 'c', customId: 'one', roles: [ADMIN] }));
    await r.handle(fake({ kind: 'autocomplete', commandName: 'c', customId: 'two' }));
    await r.handle(fake({ kind: 'autocomplete', commandName: 'ghost' }));
    assert.deepEqual(hit, ['one', 'fallback']);
});

test('autocomplete errors are not caught (the process-level handler logs them, as today)', async () => {
    const r = make({ commands: [{ name: 'c', policy: 'open', handler: ok, autocomplete: [{ policy: 'open', handle: () => { throw new Error('boom'); } }] }] });
    await assert.rejects(r.handle(fake({ kind: 'autocomplete', commandName: 'c' })), /boom/);
});

// ── errors: legacy parity per kind ───────────────────────────────────────────
const boom = () => { throw new Error('boom'); };
const expired = () => { const e = new Error('Unknown interaction'); e.code = 10062; throw e; };

test('legacy parity, button error: logs with its label, answers "Something went wrong." (follow-up if already answered)', async () => quiet(async (l) => {
    const r = make({ buttons: { exact: { a: route('open', boom) } } });
    const i = fake({ customId: 'a' }); await r.handle(i);
    const d = fake({ customId: 'a', deferred: true }); await r.handle(d);
    assert.match(l.error[0], /^\[buttonHandler\] Error handling button a: Error: boom/);
    assert.deepEqual(i.calls, [['reply', { content: 'Something went wrong.', flags: 64 }]]);
    assert.equal(d.calls[0][0], 'followUp');
}));

test('legacy parity, select and user select error: "Error handling select menu:" and "Something went wrong."', async () => quiet(async (l) => {
    const r = make({ selects: { exact: { s: route('open', boom) } }, userSelects: { exact: { u: route('open', boom) } } });
    const s = fake({ kind: 'select', customId: 's' }); await r.handle(s);
    const u = fake({ kind: 'userSelect', customId: 'u' }); await r.handle(u);
    assert.equal(l.error.length, 2); assert.match(l.error[0], /^Error handling select menu: Error: boom/);
    assert.equal(s.calls[0][1].content, 'Something went wrong.'); assert.equal(u.calls[0][1].content, 'Something went wrong.');
}));

test('legacy parity, modal error: its own text, and no reply if the interaction was already answered', async () => quiet(async (l) => {
    const r = make({ modals: { exact: { m: route('open', boom) } } });
    const i = fake({ kind: 'modal', customId: 'm' }); await r.handle(i);
    const d = fake({ kind: 'modal', customId: 'm', replied: true }); await r.handle(d);
    assert.match(l.error[0], /^Error handling modal: Error: boom/);
    assert.deepEqual(i.calls, [['reply', { content: 'There was an error processing your submission!', flags: 64 }]]);
    assert.equal(d.calls.length, 0);
}));

test('legacy parity, command error: logs, then answers with the command text (follow-up if already answered)', async () => quiet(async (l) => {
    const r = make({ commands: [{ name: 'c', policy: 'open', handler: boom }] });
    const i = fake({ kind: 'command', commandName: 'c' }); await r.handle(i);
    const d = fake({ kind: 'command', commandName: 'c', deferred: true }); await r.handle(d);
    assert.match(l.error[0], /^Error handling interaction: Error: boom/);
    assert.equal(i.calls[0][1].content, 'There was an error while executing this command!');
    assert.equal(d.calls[0][0], 'followUp');
}));

test('legacy parity, expired interaction (10062): buttons, modals and selects only warn; commands log the error first, then warn', async () => quiet(async (l) => {
    const r = make({ buttons: { exact: { a: route('open', expired) } }, modals: { exact: { m: route('open', expired) } }, selects: { exact: { s: route('open', expired) } }, commands: [{ name: 'c', policy: 'open', handler: expired }] });
    const items = [fake({ customId: 'a' }), fake({ kind: 'modal', customId: 'm' }), fake({ kind: 'select', customId: 's' }), fake({ kind: 'command', commandName: 'c' })];
    for (const i of items) await r.handle(i);
    assert.deepEqual(l.warn, [
        '[buttonHandler] Interaction expired before we could respond: a',
        '[modalHandler] Interaction expired before we could respond: m',
        '[selectHandler] Interaction expired before we could respond: s',
        '[commandHandler] Interaction expired before we could respond: c',
    ]);
    assert.equal(l.error.length, 1); assert.match(l.error[0], /^Error handling interaction:/);   // the command only
    assert.equal(items.reduce((n, i) => n + i.calls.length, 0), 0);
}));

test('when the fallback reply itself fails, it warns with the router label and never throws', async () => quiet(async (l) => {
    const r = make({ buttons: { exact: { a: route('open', boom) } }, commands: [{ name: 'c', policy: 'open', handler: boom }] });
    await r.handle(fake({ customId: 'a', failReply: true }));
    await r.handle(fake({ kind: 'command', commandName: 'c', failReply: true }));
    assert.ok(l.warn.includes('[buttonHandler] Fallback reply also failed: reply failed'));
    assert.ok(l.warn.includes('[commandHandler] Fallback reply also failed: reply failed'));
}));

test('install() registers exactly one interactionCreate listener', () => {
    const listeners = [];
    make({}).install({ on: (name, fn) => listeners.push([name, fn]) });
    assert.deepEqual(listeners.map(([n]) => n), ['interactionCreate']);
});

// ── migrating one kind at a time ─────────────────────────────────────────────
test('only: a router limited to some kinds ignores every other kind (including autocomplete)', async () => {
    const hit = [];
    const r = createRouter(createRegistry([base({
        buttons: { exact: { b: route('open', () => hit.push('button')) } },
        selects: { exact: { s: route('open', () => hit.push('select')) } },
        userSelects: { exact: { u: route('open', () => hit.push('userSelect')) } },
        commands: [{ name: 'c', policy: 'open', handler: () => hit.push('command'), autocomplete: [{ policy: 'open', handle: () => hit.push('autocomplete') }] }],
    })]), { only: ['select', 'userSelect'] });
    await r.handle(fake({ customId: 'b' }));
    await r.handle(fake({ kind: 'command', commandName: 'c' }));
    await r.handle(fake({ kind: 'autocomplete', commandName: 'c' }));
    await r.handle(fake({ kind: 'select', customId: 's' }));
    await r.handle(fake({ kind: 'userSelect', customId: 'u' }));
    assert.deepEqual(hit, ['select', 'userSelect']);
});

test('only: "command" also turns on autocomplete', async () => {
    const hit = [];
    const r = createRouter(createRegistry([base({ commands: [{ name: 'c', policy: 'open', handler: () => hit.push('command'), autocomplete: [{ policy: 'open', handle: () => hit.push('autocomplete') }] }] })]), { only: ['command'] });
    await r.handle(fake({ kind: 'command', commandName: 'c' }));
    await r.handle(fake({ kind: 'autocomplete', commandName: 'c' }));
    assert.deepEqual(hit, ['command', 'autocomplete']);
});
