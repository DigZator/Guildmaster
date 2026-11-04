const path = require('path');
const { spawnSync } = require('child_process');
const { testEnv } = require('./env');
const { root } = require('./repo');
const scan = require('./scan');
const { routesOfKinds, commandsOfRegistry } = require('./registryRoutes');
const { describeButtonRoutes } = require('./routes');

const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]))
    : v;
const plain = (v) => JSON.parse(JSON.stringify(v));

function buildCommandSnapshot() {
    const result = spawnSync(process.execPath, [
        '-r', path.join(root, 'tests/helpers/captureCommands.js'),
        path.join(root, 'deploy-commands.js'),
    ], { cwd: root, env: { ...process.env, ...testEnv }, encoding: 'utf8', timeout: 60000 });
    const match = (result.stdout || '').match(/COMMANDS_JSON_START\n([\s\S]*?)\nCOMMANDS_JSON_END/);
    if (!match) throw new Error('Could not capture the command payload from deploy-commands.js:\n' + (result.stderr || '').slice(0, 800));
    const { route, body } = JSON.parse(match[1]);
    return plain({
        registration: /^\/applications\/[^/]+\/guilds\/[^/]+\/commands$/.test(route) ? 'guild' : 'other: ' + route,
        note: 'Class choices are read from 5etools-src at deploy time and are stubbed here.',
        commands: sortKeys(body),
    });
}

function getButtonRoutes() {
    return describeButtonRoutes();
}

function commandPaths(commands) {
    const out = [];
    for (const c of commands) {
        const walk = (node, prefix) => {
            const subs = (node.options || []).filter(o => o.type === 1 || o.type === 2);
            if (!subs.length) { out.push(prefix); return; }
            for (const s of subs) walk(s, `${prefix} ${s.name}`);
        };
        walk(c, c.name);
    }
    return out;
}


function commandRouteList(commands) {
    const out = [];
    for (const c of commands) {
        const subs = (c.options || []).filter(o => o.type === 1 || o.type === 2);
        if (!subs.length) { out.push({ command: c.name }); continue; }
        for (const s of subs) {
            if (s.type === 1) { out.push({ command: c.name, sub: s.name }); continue; }
            for (const leaf of (s.options || []).filter(o => o.type === 1)) out.push({ command: c.name, group: s.name, sub: leaf.name });
        }
    }
    return out;
}


// Who gets what on every route today: drives the real routers with fake interactions (see routePermsCli.js).
function buildRoutePermissions() {
    const { commands } = buildCommandSnapshot();
    const buttons = getButtonRoutes();
    const selects = routesOfKinds(['select', 'userSelect']);
    const modals = routesOfKinds(['modal']);
    const input = {
        commands: commandRouteList(commands),
        buttons: [...buttons.exact.map(r => r.key), ...buttons.prefix.map(r => r.key + 'zz')],
        selects: selects.map(e => ({ id: e.match === 'prefix' ? e.value + 'zz' : e.value, user: e.kind === 'userSelect' })),
        modals: modals.map(e => (e.match === 'prefix' ? e.value + 'zz' : e.value)),
    };
    const result = spawnSync(process.execPath, [path.join(__dirname, 'routePermsCli.js')], {
        cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, TZ: 'UTC', ...testEnv }, input: JSON.stringify(input), encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL',
    });
    const match = (result.stdout || '').match(/ROUTEPERMS_JSON_START\n([\s\S]*?)\nROUTEPERMS_JSON_END/);
    if (!match) throw new Error('Could not characterize route permissions:\n' + (result.stderr || '').slice(0, 800));
    return plain(JSON.parse(match[1]));
}

async function buildInventory() {
    const { commands } = buildCommandSnapshot();
    const names = commands.map(c => c.name);
    const registered = commandsOfRegistry();   // read from the manifests: the old router's source no longer exists
    const routed = registered.map(c => c.name);
    const selects = routesOfKinds(['select', 'userSelect']);
    const modals = routesOfKinds(['modal']);
    return plain({
        commands: {
            registered: names,
            paths: commandPaths(commands),
            routed,
            registeredWithoutHandler: names.filter(n => !routed.includes(n)),
            handlerWithoutRegistration: routed.filter(n => !names.includes(n)),
            autocomplete: Object.fromEntries(registered.filter(c => c.autocomplete.length).map(c => [c.name, c.autocomplete])),
        },
        buttons: getButtonRoutes(),
        selects: { routes: selects },   // read from the manifests: the old router's source no longer exists
        modals: { routes: modals },   // read from the manifests: the old router's source no longer exists
        customIdProducers: scan.scanCustomIdProducers(),
        permissionChecks: scan.scanPermissionChecks(),
        startupWiring: scan.scanStartupWiring(),
    });
}

// Fires an autocomplete for every command, subcommand and option through the real routers, offline.
function buildAutocompleteSnapshot() {
    const child = spawnSync(process.execPath, [path.join(__dirname, 'autocompleteCli.js')], { encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
    const text = child.stdout || '';
    const start = text.indexOf('AUTOCOMPLETE_JSON_START');
    if (start < 0) throw new Error('autocomplete harness failed:\n' + (child.stderr || '').slice(0, 800));
    return JSON.parse(text.slice(start + 23, text.indexOf('AUTOCOMPLETE_JSON_END')));
}

module.exports = {
    buildAutocompleteSnapshot, buildCommandSnapshot, buildInventory, buildRoutePermissions, getButtonRoutes, sortKeys, plain };
