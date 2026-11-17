// ESLint rule "boundaries/feature-boundaries": plan section 4.9, rules 1 to 3, enforced on every relative require() in the
// source (top-level or inside a function, so a lazy require is checked too).
//   1. A feature exposes one public file, features/<name>/index.js. Other code imports only that.
//   2. A feature may import shared/ and another feature's index.js, never another feature's internals.
//   3. shared/ never imports a feature.
// The path is resolved the way Node resolves it, so it does not matter how deep the requiring file is.
// A recorded exception (a lazy require a circular import forces) goes in EXCEPTIONS below, with the reason; there are none.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// 'from -> to' in repo-relative posix paths, with the reason it is allowed. Reviewed, never added silently (rule 6).
const EXCEPTIONS = {
    // 'features/a/file.js -> features/b/internal.js': 'why a lazy require is unavoidable',
};

function resolveTarget(fromFile, request) {
    const base = path.resolve(path.dirname(fromFile), request);
    for (const candidate of [base + '.js', path.join(base, 'index.js'), base]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function featureOf(relPath) {
    const m = /^features\/([^/]+)\/.+/.exec(relPath);
    return m ? m[1] : null;
}

/** The problem with this import, or null. Both paths are repo-relative posix paths. */
function problemWith(from, to) {
    if (EXCEPTIONS[`${from} -> ${to}`]) return null;
    const toFeature = featureOf(to);
    if (from.startsWith('shared/') && to.startsWith('features/')) {
        return `shared/ must not import a feature (${to}); a feature may import shared/, never the other way (plan 4.9, rule 3)`;
    }
    if (toFeature && featureOf(from) !== toFeature && to !== `features/${toFeature}/index.js`) {
        return `${to} is internal to the "${toFeature}" feature; import features/${toFeature}/index.js instead (plan 4.9, rules 1 and 2)`;
    }
    return null;
}

const rule = {
    meta: { type: 'problem', schema: [], messages: { boundary: '{{ problem }}' } },
    create(context) {
        const filename = context.filename || context.getFilename();
        const from = rel(filename);
        return {
            CallExpression(node) {
                if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
                const arg = node.arguments[0];
                if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string' || !arg.value.startsWith('.')) return;
                const target = resolveTarget(filename, arg.value);
                if (!target) return;
                const problem = problemWith(from, rel(target));
                if (problem) context.report({ node, messageId: 'boundary', data: { problem } });
            },
        };
    },
};

module.exports = { plugin: { rules: { 'feature-boundaries': rule } }, problemWith, EXCEPTIONS };
