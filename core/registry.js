const { getPolicy } = require('../shared/auth');

// Collects feature manifests into route tables and refuses to start if they are inconsistent.
// Problems are collected and reported together, so one run shows everything that needs fixing.

const ROUTE_KINDS = Object.freeze({ buttons: 'button', modals: 'modal', selects: 'select', userSelects: 'userSelect' });

// `gate` documents where the permission check lives TODAY when it is still inside the handler:
// either a policy name, or 'own: <what>' for checks that are not a named policy. It is never enforced.
function checkGate(where, spec, problems) {
    if (spec.gate === undefined) return;
    if (typeof spec.gate !== 'string') { problems.push(`${where}: gate must be a string`); return; }
    if (spec.gate.startsWith('own:')) return;
    try { getPolicy(spec.gate); } catch { problems.push(`${where}: unknown gate "${spec.gate}"`); }
}

function checkRoute(where, spec, problems) {
    if (spec) checkGate(where, spec, problems);
    if (!spec || typeof spec.handler !== 'function') { problems.push(`${where}: no handler function`); return; }
    if (typeof spec.policy !== 'string') { problems.push(`${where}: no policy (write 'open' if it really is open to everyone)`); return; }
    try { getPolicy(spec.policy); } catch { problems.push(`${where}: unknown policy "${spec.policy}"`); }
}

function addCustomIdRoutes(table, kind, owner, def, problems) {
    for (const [type, map] of [['exact', def.exact], ['prefix', def.prefix]]) {
        for (const [id, spec] of Object.entries(map || {})) {
            const where = `${owner} ${kind} ${type} "${id}"`;
            checkRoute(where, spec, problems);
            if (type === 'exact') {
                if (table.exact.has(id)) problems.push(`${where}: already registered by ${table.exact.get(id).owner}`);
                else table.exact.set(id, { ...spec, owner });
            } else {
                const clash = table.prefix.find(p => p.id === id);
                if (clash) problems.push(`${where}: already registered by ${clash.owner}`);
                else table.prefix.push({ ...spec, id, owner });
            }
        }
    }
}

function checkOverlaps(table, kind, problems) {
    const prefixes = table.prefix.map(p => p.id);
    for (const a of table.prefix) {
        for (const b of table.prefix) {
            if (a !== b && a.id !== b.id && a.id.startsWith(b.id)) {
                problems.push(`${kind} prefix "${a.id}" (${a.owner}) is also matched by the shorter prefix "${b.id}" (${b.owner}); the order would decide which one runs`);
            }
        }
    }
    for (const id of table.exact.keys()) {
        const hit = prefixes.find(p => id.startsWith(p));
        if (hit) problems.push(`${kind} exact "${id}" (${table.exact.get(id).owner}) also starts with the prefix "${hit}"`);
    }
}

function addCommand(commands, owner, cmd, problems) {
    const where = `${owner} command "${cmd?.name}"`;
    if (!cmd || !cmd.name) { problems.push(`${owner}: a command has no name`); return; }
    checkRoute(where, cmd, problems);
    if (commands.has(cmd.name)) { problems.push(`${where}: already registered by ${commands.get(cmd.name).owner}`); return; }
    for (const [key, spec] of Object.entries(cmd.subcommands || {})) {
        if (spec) checkGate(`${where} subcommand "${key}"`, spec, problems);
        if (!spec || typeof spec.policy !== 'string') problems.push(`${where} subcommand "${key}": no policy`);
        else { try { getPolicy(spec.policy); } catch { problems.push(`${where} subcommand "${key}": unknown policy "${spec.policy}"`); } }
    }
    (cmd.autocomplete || []).forEach((entry, i) => {
        const at = `${where} autocomplete #${i + 1}`;
        checkGate(at, entry, problems);
        if (typeof entry.handle !== 'function') problems.push(`${at}: no handle function`);
        if (typeof entry.policy !== 'string') problems.push(`${at}: no policy`);
        else { try { getPolicy(entry.policy); } catch { problems.push(`${at}: unknown policy "${entry.policy}"`); } }
    });
    commands.set(cmd.name, { ...cmd, owner });
}

// Builds the registry. Returns { problems, registry }; registry is null when there are problems.
function inspect(manifests) {
    const problems = [];
    const tables = Object.fromEntries(Object.values(ROUTE_KINDS).map(kind => [kind, { exact: new Map(), prefix: [] }]));
    const commands = new Map();
    const inits = [];

    for (const manifest of manifests) {
        const owner = manifest?.name || '(unnamed manifest)';
        for (const cmd of manifest.commands || []) addCommand(commands, owner, cmd, problems);
        for (const [key, kind] of Object.entries(ROUTE_KINDS)) {
            if (manifest[key]) addCustomIdRoutes(tables[kind], kind, owner, manifest[key], problems);
        }
        if (manifest.init) inits.push({ owner, init: manifest.init });
    }
    for (const [kind, table] of Object.entries(tables)) checkOverlaps(table, kind, problems);

    return { problems, registry: problems.length ? null : { commands, tables, inits } };
}

// The load-time gate: any problem is a startup error that lists all of them.
function createRegistry(manifests) {
    const { problems, registry } = inspect(manifests);
    if (problems.length) throw new Error(`[registry] ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
    return registry;
}

// Exact id first, then the prefix; the overlap check guarantees at most one prefix can match.
function findCustomIdRoute(registry, kind, id) {
    const table = registry.tables[kind];
    return table.exact.get(id) ?? table.prefix.find(p => id.startsWith(p.id));
}

module.exports = { createRegistry, inspect, findCustomIdRoute, ROUTE_KINDS };
