// The feature manifests (Phase 3, step 2) wrap today's handlers without moving them. These tests tie the
// manifests to the two snapshots that describe today's behavior, so a manifest cannot silently drift.
// Nothing is enforced by the router yet: every route has policy 'open' and records, in `gate`, where its
// permission check still lives (inside the handler).
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspect, findCustomIdRoute } = require('../core/registry');
const { POLICIES } = require('../shared/auth');
const { loadRegistryData } = require('./helpers/registryRoutes');
const inventory = require('./snapshots/inventory.json');
const routePerms = require('./snapshots/routePermissions.json');

// Loaded in a child process with the network blocked (loading the handlers starts background work).
const loaded = loadRegistryData();
const { problems } = loaded;
const registry = loaded.registry && {
    commands: new Map(loaded.registry.commands.map(c => [c.name, c])),
    tables: Object.fromEntries(Object.entries(loaded.registry.tables).map(([kind, t]) => [kind, { exact: new Map(t.exact.map(s => [s.id, s])), prefix: t.prefix }])),
};
const policyForLegacy = Object.fromEntries(Object.values(POLICIES).filter(p => p.legacy).map(p => [p.legacy, p.name]));

const keys = (map) => [...map.keys()].sort();
const prefixes = (table) => table.prefix.map(p => p.id).sort();

test('all manifests load and form a valid registry', () => {
    assert.deepEqual(problems, []);
    assert.ok(registry);
});

test('every route has a handler function', () => {
    const all = [...registry.commands.values(), ...Object.values(registry.tables).flatMap(t => [...t.exact.values(), ...t.prefix])];
    for (const spec of all) assert.equal(spec.hasHandler, true, `${spec.owner} ${spec.name ?? spec.id}`);
});

test('commands: exactly the registered commands, each with a handler', () => {
    assert.deepEqual(keys(registry.commands), [...inventory.commands.registered].sort());
});

// Written out by hand on purpose: this is the list the old button router handled, so retiring it cannot
// silently add or drop a route.
const BUTTON_EXACT = ['announce_cancel', 'announce_confirm', 'announce_edit', 'anon_nokey_cancel', 'anon_nokey_confirm', 'archive_cancel', 'continue_memorial_part2', 'create_campaign_cancel', 'create_campaign_confirm', 'dtbuy_cancel', 'dtbuy_confirm', 'leagueDashBalance', 'leagueDashDowntimes', 'leagueDashEdit', 'leagueDashInventory', 'leagueDashProfile', 'leagueDashQuests', 'leagueDashSetArt', 'leagueDashSwitch', 'memorial_mod_approve', 'memorial_mod_deny', 'memorial_preview_cancel', 'memorial_preview_confirm', 'shopbuy_discount_no', 'shopbuy_discount_yes', 'shopsell_confirm_no', 'shopsell_confirm_yes', 'startitems_cancel', 'startitems_confirm', 'tlrRemoveCancel', 'tlrRemoveProceed', 'tlrRemoveRequest', 'tlrSubmit', 'verification:retry', 'verification:start'];
const BUTTON_PREFIX = ['anon_cancel_', 'anon_confirm_', 'anon_remove_cancel_', 'anon_remove_confirm_', 'archive_confirm_', 'cancel_remove_', 'channelFile:', 'charstatus_cancel:', 'charstatus_confirm:', 'config:', 'confirm_remove_', 'dl:', 'editgame_checkbox_', 'inv_next_', 'inv_prev_', 'leaderboard_page:', 'list_games_next_', 'list_games_prev_', 'marketbrowse_next_', 'marketbrowse_prev_', 'questDash:', 'shopbrowse_next_', 'shopbrowse_prev_', 'shopsearch_next_', 'shopsearch_prev_', 'startitems_pick_', 'tableAdmin:', 'tableAdminReactivate:', 'ticket:', 'ticketCreate:', 'verification:pending:'];

test('buttons: exactly the routes the old button router handled (35 exact, 31 prefix)', () => {
    assert.deepEqual(keys(registry.tables.button.exact), [...BUTTON_EXACT].sort());
    assert.deepEqual(prefixes(registry.tables.button), [...BUTTON_PREFIX].sort());
});

// Written out by hand on purpose: this is the list the old modal router handled, so retiring it cannot
// silently add or drop a route.
test('modals: exactly the routes the old modal router handled', () => {
    assert.deepEqual(keys(registry.tables.modal.exact), ['characterSubmission_1', 'characterSubmission_2', 'leagueCreate', 'tlrRemoveModal', 'verification:modal']);
    assert.deepEqual(prefixes(registry.tables.modal), ['announceedit_modal_', 'channelFile:', 'editgame_modal_', 'leagueDashEditModal:', 'questDash:', 'tableAdminAddPlayerModal:', 'tableAdminNumberModal:', 'ticket:', 'ticketCreateModal:']);
});

// Written out by hand on purpose: this is the list the old select router handled, so retiring that router
// cannot silently add or drop a route.
test('select menus: exactly the routes the old select router handled (string and user selects)', () => {
    assert.deepEqual(keys(registry.tables.select.exact), ['announce_edit_select', 'leagueDashSwitchSelect', 'shopbuy_discount_select', 'starter_items_select', 'tlrRemoveSelect']);
    assert.deepEqual(prefixes(registry.tables.select), ['questDash:', 'tableAdminSeatSelect:']);
    assert.deepEqual(keys(registry.tables.userSelect.exact), []);
    assert.deepEqual(prefixes(registry.tables.userSelect), ['questDash:']);
});

// The routes the router enforces today. Written out by hand on purpose: lifting a check out of a handler into
// the router is a deliberate step, so it must show up here (Phase 3, step 4 moves routes onto this list).
const DENIED_TEXT = '❌ You don\'t have permission to run this.';
const ENFORCED_COMMANDS = {
    create_campaign: 'admin', announce_game: 'admin', edit_game: 'admin', get_players: 'admin',
    manipulate_table: 'admin', archive: 'admin', 'archive-config': 'admin',
    rss: 'admin_ctrl', anon_msg: 'admin_ctrl', schedule_activation: 'admin_ctrl',
    leagueadmin: 'league_legacy', direct_line: 'hr',
};
// Commands whose refusal is not the router's default: the exact text their handler used to give.
const COMMAND_DENIED = {
    rss: '❌ This command can only be used by admins in the admin channel.',
    anon_msg: '❌ This command can only be used by admins in the admin channel.',
    schedule_activation: '❌ This command can only be used by admins in the mod channel.',
    leagueadmin: '❌ You must be an admin or use this in the league admin channel.',
    direct_line: '❌ Only HR can use this command.',
};
const ENFORCED_SUBCOMMANDS = {
    'the_long_rest setup': 'admin', 'the_long_rest reindex': 'admin',
    'ticket setup': 'admin', 'ticket config': 'admin', 'ticket reset_counter': 'admin',
    'ticket type add': 'admin', 'ticket type edit': 'admin', 'ticket type remove': 'admin', 'ticket type list': 'admin',
};
const OWN_DENIED = new Set(['the_long_rest', 'ticket']);

test('the routes the router enforces are exactly the pinned list; everything else is still open', () => {
    const commands = {}, subcommands = {};
    for (const cmd of registry.commands.values()) {
        if (cmd.policy !== 'open') commands[cmd.name] = cmd.policy;
        for (const [key, spec] of Object.entries(cmd.subcommands)) {
            if (spec.policy !== 'open') subcommands[`${cmd.name} ${key}`] = spec.policy;
        }
    }
    assert.deepEqual(commands, ENFORCED_COMMANDS);
    assert.deepEqual(subcommands, ENFORCED_SUBCOMMANDS);
    for (const t of Object.values(registry.tables)) {
        for (const spec of [...t.exact.values(), ...t.prefix]) assert.equal(spec.policy, 'open', spec.owner);
    }
});

test('an enforced route no longer records a gate (the check is in the router now, not in the handler)', () => {
    for (const cmd of registry.commands.values()) {
        if (cmd.policy !== 'open') assert.equal(cmd.gate, undefined, cmd.name);
        for (const [key, spec] of Object.entries(cmd.subcommands)) {
            if (spec.policy !== 'open') assert.equal(spec.gate, undefined, `${cmd.name} ${key}`);
        }
    }
});

test('the refusal text of each enforced route is the one its handler used to give', () => {
    for (const name of Object.keys(ENFORCED_COMMANDS)) assert.equal(registry.commands.get(name).denied, COMMAND_DENIED[name], `${name} refusal text`);
    for (const key of Object.keys(ENFORCED_SUBCOMMANDS)) {
        const [name, ...rest] = key.split(' ');
        assert.ok(OWN_DENIED.has(name));
        assert.equal(registry.commands.get(name).subcommands[rest.join(' ')].denied, DENIED_TEXT, key);
    }
});

// What the snapshot saw for a route: the isAdminChannel type(s) it reached, or null if none was reached.
function reachedPolicy(entry) {
    const types = new Set();
    for (const key of Object.keys(entry.results)) {
        const m = key.match(/^(\w+)=(true|false)/);
        if (m) types.add(m[1]);
    }
    if (!types.size) return null;
    assert.equal(types.size, 1, `${entry.route} reaches several checks: ${[...types]}`);
    return policyForLegacy[[...types][0]];
}

function commandGate(route) {
    const [name, ...rest] = route.split(' ');
    const cmd = registry.commands.get(name);
    assert.ok(cmd, `no manifest for command ${name}`);
    const override = rest.length ? cmd.subcommands?.[rest.join(' ')] : undefined;
    const spec = override ?? cmd;
    return spec.policy !== 'open' ? spec.policy : spec.gate;
}

// Routes whose check the harness cannot reach with synthetic input (the handler returns early on the fake id).
// Their gate is a claim taken from the source, not proven by the snapshot; each is cross-checked against the
// static permission inventory below. Writing a test for each is part of lifting its check (step 4).
const BLIND_SPOTS = {
    'config:zz': { gate: 'admin', file: 'buttons/config.js', type: 'botAdmin' },
    'dl:zz': { gate: 'hr', file: 'buttons/directLine.js', type: 'hr' },
};

// Commands whose real check is wider than the isAdminChannel call the snapshot can see. /verification also lets
// in the Discord Administrator permission (utils/verificationAdmin.js), so it must NOT be written as a plain admin gate.
const COMBINED_GATES = ['verification '];

function assertGate(label, expected, gate) {
    const blind = BLIND_SPOTS[label];
    if (expected && COMBINED_GATES.some(prefix => label.startsWith(prefix))) {
        assert.ok(typeof gate === 'string' && gate.startsWith('own:') && /Discord Administrator/.test(gate), `${label}: the real check is wider than "${expected}"`);
    } else if (!expected && blind) assert.equal(gate, blind.gate, `${label}: documented blind spot`);
    else if (expected) assert.equal(gate, expected, `${label}: the snapshot shows "${expected}"`);
    else assert.ok(gate === undefined || gate.startsWith('own:'), `${label}: the snapshot shows no named check, but the manifest says "${gate}"`);
}

test('commands: each manifest gate matches the check the route-permission snapshot recorded', () => {
    for (const entry of routePerms.commands) assertGate(entry.route, reachedPolicy(entry), commandGate(entry.route));
});

test('buttons: each manifest gate matches the snapshot', () => {
    for (const entry of routePerms.buttons) {
        const spec = findCustomIdRoute(registry, 'button', entry.route);
        assert.ok(spec, `no manifest route for button ${entry.route}`);
        assertGate(entry.route, reachedPolicy(entry), spec.gate);
    }
});

test('modals and selects: each is routed, and no named check was reached by the snapshot', () => {
    for (const [kind, list] of [['modal', routePerms.modals], ['select', routePerms.selects]]) {
        for (const entry of list) {
            const user = /\(user select\)$/.test(entry.route);
            const id = entry.route.replace(/ \(user select\)$/, '');
            const spec = findCustomIdRoute(registry, user ? 'userSelect' : kind, id);
            assert.ok(spec, `no manifest route for ${kind} ${entry.route}`);
            assertGate(entry.route, reachedPolicy(entry), spec.gate);
        }
    }
});

test('each documented blind spot is backed by a real isAdminChannel call in its source file', () => {
    for (const [label, { file, type }] of Object.entries(BLIND_SPOTS)) {
        assert.ok(inventory.permissionChecks[file]?.isAdminChannel?.[type] >= 1, `${label}: ${file} does not call isAdminChannel(…, '${type}')`);
    }
});

test('every source file that still calls isAdminChannel belongs to a route that records a gate', () => {
    // buttons/config, buttons/directLine and buttons/channelFile call it; the snapshot cannot reach all of
    // them, so check the manifests directly.
    assert.equal(findCustomIdRoute(registry, 'button', 'config:x').gate, 'admin');
    assert.equal(findCustomIdRoute(registry, 'button', 'dl:x').gate, 'hr');
    assert.equal(findCustomIdRoute(registry, 'button', 'channelFile:x').gate, 'cmd');
    assert.equal(findCustomIdRoute(registry, 'modal', 'channelFile:x').gate, 'cmd');
});

test('the ticket modal handler returning false still means "unhandled"', () => {
    assert.equal(findCustomIdRoute(registry, 'modal', 'ticket:x').falseMeansUnhandled, true);
    assert.equal(findCustomIdRoute(registry, 'modal', 'ticketCreateModal:x').falseMeansUnhandled, true);
    assert.equal(findCustomIdRoute(registry, 'modal', 'editgame_modal_x').falseMeansUnhandled, undefined);
});

test('a gate that names an unknown policy is rejected by the registry', () => {
    const bad = inspect([{ name: 'x', commands: [{ name: 'c', policy: 'open', gate: 'adimn', handler: () => {} }] }]);
    assert.match(bad.problems.join('\n'), /unknown gate "adimn"/);
    const ok = inspect([{ name: 'x', commands: [{ name: 'c', policy: 'open', gate: 'own: something', handler: () => {} }] }]);
    assert.deepEqual(ok.problems, []);
});
