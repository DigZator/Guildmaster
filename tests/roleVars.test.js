// Startup warnings for missing role env vars (refactor plan section 6.4). Log-only.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_VARS, missingRoles, formatReport, report } = require('../config/roleVars');
const { sourceFiles, read } = require('./helpers/repo');
const { stripComments } = require('./helpers/scan');

const allSet = Object.fromEntries(ROLE_VARS.map(r => [r.key, '1']));
const capture = () => { const out = { warn: [], error: [] }; return { out, log: { warn: (m) => out.warn.push(m), error: (m) => out.error.push(m) } }; };

test('nothing is logged when every role is set', () => {
    const { out, log } = capture();
    assert.deepEqual(report(log, allSet), []);
    assert.deepEqual(out, { warn: [], error: [] });
});

test('a missing feature role is one warning that names it and says what stops working', () => {
    const { out, log } = capture();
    const missing = report(log, { ...allSet, HR_ROLE_ID: '' });
    assert.deepEqual(missing.map(m => m.key), ['HR_ROLE_ID']);
    assert.equal(out.error.length, 0);
    assert.equal(out.warn.length, 1);
    assert.match(out.warn[0], /HR_ROLE_ID/);
    assert.match(out.warn[0], /denies everyone/);
});

test('a missing core role is logged as an error', () => {
    const { out, log } = capture();
    report(log, { ...allSet, ADMINS_ROLE_ID: undefined });
    assert.equal(out.error.length, 1);
    assert.match(out.error[0], /ADMINS_ROLE_ID/);
});

test('several missing roles produce a single message listing all of them', () => {
    const { out, log } = capture();
    report(log, {});
    assert.equal(out.error.length + out.warn.length, 1);
    const text = out.error[0] || out.warn[0];
    for (const r of ROLE_VARS) assert.ok(text.includes(r.key), `${r.key} listed`);
    assert.match(text, /10 of 10/);
});

test('missingRoles reads process.env by default', () => {
    const saved = process.env.INVENTORY_ROLE_ID;
    try {
        process.env.INVENTORY_ROLE_ID = '';
        assert.ok(missingRoles().some(m => m.key === 'INVENTORY_ROLE_ID'));
    } finally { if (saved === undefined) delete process.env.INVENTORY_ROLE_ID; else process.env.INVENTORY_ROLE_ID = saved; }
});

test('every *_ROLE_ID the code reads from process.env is in the registry', () => {
    const known = new Set(ROLE_VARS.map(r => r.key));
    const unregistered = new Set();
    for (const file of sourceFiles()) {
        for (const m of stripComments(read(file)).matchAll(/process\.env\.([A-Z][A-Z0-9_]*_ROLE_ID)\b/g)) if (!known.has(m[1])) unregistered.add(`${m[1]} (${file})`);
    }
    assert.deepEqual([...unregistered], [], 'add these to config/roleVars.js');
});

test('every registered role variable is documented in .env.example', () => {
    const example = read('.env.example');
    for (const r of ROLE_VARS) assert.match(example, new RegExp(`^${r.key}=`, 'm'), r.key);
});

test('formatReport names the count and each variable', () => {
    assert.match(formatReport([ROLE_VARS[0]]), /1 of 10 role variables/);
});
