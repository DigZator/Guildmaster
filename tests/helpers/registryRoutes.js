// The routes the new router knows, read from the real manifests in an offline child process
// (see manifestsCli.js). Cached for the life of the test process.
const path = require('path');
const { spawnSync } = require('child_process');

let cached;
function loadRegistryData() {
    if (cached) return cached;
    const child = spawnSync(process.execPath, [path.join(__dirname, 'manifestsCli.js')], { encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024 });
    const text = child.stdout || '';
    const start = text.indexOf('MANIFESTS_JSON_START');
    if (start < 0) throw new Error('Could not load the manifests:\n' + (child.stderr || '').slice(0, 800));
    cached = JSON.parse(text.slice(start + 20, text.indexOf('MANIFESTS_JSON_END')));
    return cached;
}

// Entries { kind, match: 'exact' | 'prefix', value, owner } for the given kinds, in a stable order.
function routesOfKinds(kinds) {
    const { registry } = loadRegistryData();
    const out = [];
    for (const kind of kinds) {
        const table = registry.tables[kind];
        for (const s of [...table.exact].sort((a, b) => a.id.localeCompare(b.id))) out.push({ kind, match: 'exact', value: s.id, owner: s.owner });
        for (const s of [...table.prefix].sort((a, b) => a.id.localeCompare(b.id))) out.push({ kind, match: 'prefix', value: s.id, owner: s.owner });
    }
    return out;
}

// Commands as { name, owner, autocomplete: [entry names] }, sorted by name.
function commandsOfRegistry() {
    const { registry } = loadRegistryData();
    return registry.commands.map(c => ({ name: c.name, owner: c.owner, autocomplete: c.autocomplete.map(a => a.name) })).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { loadRegistryData, routesOfKinds, commandsOfRegistry };
