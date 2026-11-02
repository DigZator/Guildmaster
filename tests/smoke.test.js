require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { testEnv } = require('./helpers/env');
const { root } = require('./helpers/repo');
const { buildCommandSnapshot, getButtonRoutes } = require('./helpers/snapshots');
const { scanCommandRoutes } = require('./helpers/scan');

test('every module loads; every relative require resolves; every imported name is exported', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'helpers', 'loadAll.js')], {
        cwd: root, env: { ...process.env, ...testEnv }, encoding: 'utf8', timeout: 120000,
    });
    const match = (result.stdout || '').match(/LOADALL_JSON_START\n([\s\S]*?)\nLOADALL_JSON_END/);
    assert.ok(match, 'loadAll produced no result:\n' + (result.stderr || '').slice(0, 800));
    const { loadResults, problems } = JSON.parse(match[1]);
    const failed = Object.entries(loadResults).filter(([, v]) => v !== 'ok').map(([k, v]) => `${k}: ${v}`);
    assert.deepEqual(failed, [], 'modules that fail to load');
    assert.deepEqual(problems.map(p => `${p.file} -> ${p.spec}: ${p.problem}`), [], 'broken requires/exports');
    assert.ok(Object.keys(loadResults).length > 150, 'suspiciously few modules were checked');
});

test('every registered command has a handler branch, and every branch has a registered command', () => {
    const registered = buildCommandSnapshot().commands.map(c => c.name);
    const routed = scanCommandRoutes().handlers.map(h => h.command);
    assert.deepEqual(registered.filter(n => !routed.includes(n)), [], 'registered but not routed');
    assert.deepEqual(routed.filter(n => !registered.includes(n)), [], 'routed but not registered');
});

test('button router: every declared route resolves to a handler (exact routes to their own)', () => {
    const routes = getButtonRoutes();
    assert.ok(routes.exact.length > 0 && routes.prefix.length > 0, 'no routes found');
    for (const r of routes.exact) {
        assert.equal(r.winner, `${r.declaredBy[r.declaredBy.length - 1]}.exact[${r.key}]`, `exact route ${r.key}`);
    }
    for (const r of routes.prefix) assert.ok(r.winner, `prefix route ${r.key} resolves to no handler`);
    assert.equal(routes.unknownIdHandled, false, 'an unregistered id must not be handled');
});
