// Resolves button routes by driving the REAL buttonHandler listener.
// Handler functions in each module's exact/prefix tables are wrapped before the router is
// required, so the router's own lookup decides which one fires. Use in a fresh process only.
require('./env');
const path = require('path');
const { root, read } = require('./repo');

function buildButtonRoutes() {
    const routerSource = read('interactions/buttonHandler.js');
    const modules = [...routerSource.matchAll(/const\s+(\w+)\s*=\s*require\('(\.\.\/buttons\/[^']+)'\)/g)]
        .map(m => ({ name: m[1], spec: m[2] }));

    const declared = { exact: {}, prefix: {} };
    const hits = [];
    for (const { name, spec } of modules) {
        const mod = require(path.join(root, 'interactions', spec));
        for (const kind of ['exact', 'prefix']) {
            const table = mod[kind];
            if (!table) continue;
            for (const key of Object.keys(table)) {
                (declared[kind][key] = declared[kind][key] || []).push(name);
                table[key] = async function wrapped() { hits.push(`${name}.${kind}[${key}]`); };
            }
        }
    }

    let listener;
    require(path.join(root, 'interactions', 'buttonHandler.js'))({ on: (_event, fn) => { listener = fn; } });

    async function fire(customId) {
        hits.length = 0;
        const warn = console.warn;
        console.warn = () => {};
        try {
            await listener({
                isButton: () => true, customId, replied: false, deferred: false,
                reply: async () => {}, followUp: async () => {},
            });
        } finally { console.warn = warn; }
        return hits.slice();
    }

    return { modules: modules.map(m => m.name), declared, fire };
}

async function describeButtonRoutes() {
    const { modules, declared, fire } = buildButtonRoutes();
    const exact = [];
    for (const key of Object.keys(declared.exact).sort()) {
        exact.push({ key, declaredBy: declared.exact[key], winner: (await fire(key))[0] || null });
    }
    const prefix = [];
    for (const key of Object.keys(declared.prefix)) {
        const alsoMatches = Object.keys(declared.prefix).filter(other => other !== key && key.startsWith(other));
        prefix.push({ key, declaredBy: declared.prefix[key], alsoMatches, winner: (await fire(key + 'zz'))[0] || null });
    }
    prefix.sort((a, b) => a.key.localeCompare(b.key));
    const duplicates = ['exact', 'prefix']
        .flatMap(kind => Object.entries(declared[kind]).filter(([, who]) => who.length > 1).map(([key, who]) => ({ kind, key, declaredBy: who })));
    const exactShadowedByPrefix = Object.keys(declared.exact)
        .map(key => ({ key, prefixes: Object.keys(declared.prefix).filter(p => key.startsWith(p)) }))
        .filter(x => x.prefixes.length);
    const unknownIdHandled = (await fire('definitely:not:a:registered:id')).length > 0;
    return {
        routerModules: modules, exact, prefix, duplicates,
        overlaps: prefix.filter(p => p.alsoMatches.length || p.winner !== `${p.declaredBy[p.declaredBy.length - 1]}.prefix[${p.key}]`),
        exactShadowedByPrefix, unknownIdHandled,
    };
}

module.exports = { describeButtonRoutes };
