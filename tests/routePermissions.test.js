// Route-level characterization: who gets what on every command, button, select and modal today.
// Every route is driven through the REAL routers with a fake interaction, once per persona
// (see helpers/routePermsCli.js). Nothing here reaches Discord or Notion, and data/ must not change.
//
// Reading the snapshot: "no-isAdminChannel-call" means the route did not reach an isAdminChannel check
// with the synthetic input (no options, made-up ids). It does NOT prove the route is open: some routes
// use role checks of their own (the personas then get different replies) and some stop earlier.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildRoutePermissions, plain } = require('./helpers/snapshots');
const { differences } = require('./helpers/diff');
const { root } = require('./helpers/repo');

const stored = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'snapshots', 'routePermissions.json'), 'utf8'));

function dataFingerprint() {
    const dir = path.join(root, 'data');
    const out = {};
    (function walk(d) {
        if (!fs.existsSync(d)) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full);
            else { const st = fs.statSync(full); out[path.relative(dir, full)] = `${st.size}:${st.mtimeMs}`; }
        }
    })(dir);
    return out;
}

const allRoutes = (r) => [...r.commands, ...r.buttons, ...r.selects, ...r.modals];
const gateResults = (route) => Object.entries(route.results).filter(([k]) => !k.startsWith('no-isAdminChannel-call'));

let fresh;
let dataBefore;
let dataAfter;
test('route permissions: the harness runs offline and does not touch data/', () => {
    dataBefore = dataFingerprint();
    fresh = buildRoutePermissions();
    dataAfter = dataFingerprint();
    assert.deepEqual(dataAfter, dataBefore, 'data/ was modified while characterizing routes');
    assert.ok(fresh.commands.length > 80 && fresh.buttons.length > 50, 'suspiciously few routes were driven');
});

test('route permissions: the committed snapshot matches today\'s behavior', () => {
    const diffs = differences(stored(), plain(fresh));
    if (diffs.length) assert.fail(`Route permissions changed:\n  - ${diffs.join('\n  - ')}\nIf this change is intended, run \`npm run snapshots:update\`, review the diff and commit it.`);
});

test('route permissions: the harness actually reaches the checks (not vacuous)', () => {
    const reached = allRoutes(fresh).filter(r => gateResults(r).length);
    assert.ok(reached.length >= 40, `only ${reached.length} routes reached an isAdminChannel check`);
});

test('route permissions: nobody and Discord Administrator alone never pass an isAdminChannel check', () => {
    const offenders = [];
    for (const route of allRoutes(fresh)) {
        for (const [result, who] of gateResults(route)) {
            if (!/=true/.test(result) || /^admin_or_discord_admin=/.test(result)) continue;   // that policy admits Discord Administrator on purpose, see the next test
            for (const persona of ['nobody', 'discord-administrator']) if (who.includes(persona)) offenders.push(`${route.route}: ${persona} -> ${result}`);
        }
    }
    assert.deepEqual(offenders, []);
});

test('route permissions: admin_or_discord_admin (/verification) admits the Admins role and Discord Administrator, and nobody else', () => {
    const seen = new Set();
    for (const route of allRoutes(fresh)) {
        for (const [result, who] of gateResults(route)) {
            if (!/^admin_or_discord_admin=/.test(result)) continue;
            seen.add(route.route);
            const passed = /=true/.test(result);
            for (const persona of who) {
                const shouldPass = ['admins-role', 'admins-role@ctrl-channel', 'discord-administrator'].includes(persona);
                assert.equal(passed, shouldPass, `${route.route}: ${persona}`);
            }
        }
    }
    assert.ok(seen.size >= 7, `only ${seen.size} routes reached the policy (6 subcommands and the pager button expected)`);
});

test('route permissions: documents current behavior: the league-admin channel alone passes league checks', () => {
    const passes = allRoutes(fresh).filter(r => gateResults(r).some(([res, who]) => /league=true/.test(res) && who.includes('nobody@league-channel')));
    assert.ok(passes.length > 0, 'no league route admitted a member who only stood in the league-admin channel');
});

test('route permissions: documents current behavior: botChannelAdmin needs the role AND the control channel', () => {
    const routes = allRoutes(fresh).filter(r => gateResults(r).some(([res]) => /botChannelAdmin=/.test(res)));
    assert.ok(routes.length > 0, 'no route reached a botChannelAdmin check');
    for (const route of routes) {
        for (const [result, who] of gateResults(route)) {
            if (!/botChannelAdmin=true/.test(result)) continue;
            assert.deepEqual(who.sort(), ['admins-role@ctrl-channel'], `${route.route}: only role + control channel should pass`);
        }
    }
});
