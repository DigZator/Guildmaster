// Child process: loads every source module, then checks that every relative require resolves
// and that every destructured / member-accessed name actually exists on the target module.
require('./env');
const Module = require('module');
const path = require('path');
const { root, loadableFiles, sourceFiles } = require('./repo');
const { scanRelativeRequires } = require('./scan');

const loadResults = {};
for (const file of loadableFiles()) {
    try { require(path.join(root, file)); loadResults[file] = 'ok'; }
    catch (err) { loadResults[file] = 'ERR ' + String(err.message).split('\n')[0].slice(0, 160); }
}

const problems = [];
for (const file of sourceFiles()) {
    const req = Module.createRequire(path.join(root, file));
    for (const { spec, names } of scanRelativeRequires(file)) {
        let resolved;
        try { resolved = req.resolve(spec); }
        catch { problems.push({ file, spec, problem: 'does not resolve' }); continue; }
        if (!names.length) continue;
        let exported;
        try { exported = req(spec); } catch { continue; }
        for (const name of names) {
            if (exported == null || !(name in Object(exported))) {
                problems.push({ file, spec: path.relative(root, resolved).split(path.sep).join('/'), problem: `missing export "${name}"` });
            }
        }
    }
}
const key = p => `${p.file}|${p.spec}|${p.problem}`;
const seen = new Set();
const unique = problems.filter(p => !seen.has(key(p)) && seen.add(key(p)));
process.stdout.write('LOADALL_JSON_START\n' + JSON.stringify({ loadResults, problems: unique }) + '\nLOADALL_JSON_END\n');
process.exit(0);
