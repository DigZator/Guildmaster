// Describes the button routes the new router knows, read from the real manifests (see registryRoutes.js)
// and resolved through the router's own lookup function, so "which route wins for this id" is decided by
// the same code that runs live.
const { loadRegistryData } = require('./registryRoutes');
const { findCustomIdRoute } = require('../../core/registry');

function describeButtonRoutes() {
    const { registry } = loadRegistryData();
    const table = registry.tables.button;
    const lookup = { tables: { button: { exact: new Map(table.exact.map(s => [s.id, s])), prefix: table.prefix } } };

    const winnerOf = (id) => {
        const spec = findCustomIdRoute(lookup, 'button', id);
        if (!spec) return null;
        return `${spec.owner}.${lookup.tables.button.exact.get(spec.id) === spec ? 'exact' : 'prefix'}[${spec.id}]`;
    };

    const exact = [...table.exact].sort((a, b) => a.id.localeCompare(b.id))
        .map(s => ({ key: s.id, declaredBy: [s.owner], winner: winnerOf(s.id) }));
    const prefix = [...table.prefix].sort((a, b) => a.id.localeCompare(b.id))
        .map(s => ({
            key: s.id, declaredBy: [s.owner],
            alsoMatches: table.prefix.filter(o => o.id !== s.id && s.id.startsWith(o.id)).map(o => o.id),
            winner: winnerOf(s.id + 'zz'),
        }));
    return {
        owners: [...new Set([...table.exact, ...table.prefix].map(s => s.owner))].sort(),
        exact,
        prefix,
        // The registry refuses duplicates at load, so these stay empty unless that guarantee is broken.
        duplicates: [],
        overlaps: prefix.filter(p => p.alsoMatches.length || p.winner !== `${p.declaredBy[0]}.prefix[${p.key}]`),
        exactShadowedByPrefix: table.exact.map(s => ({ key: s.id, prefixes: table.prefix.filter(p => s.id.startsWith(p.id)).map(p => p.id) })).filter(x => x.prefixes.length),
        unknownIdHandled: winnerOf('definitely:not:a:registered:id') !== null,
    };
}

module.exports = { describeButtonRoutes };
