// Frozen contracts: what Discord is told about, and how interactions are routed and guarded today.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildCommandSnapshot, buildInventory, plain } = require('./helpers/snapshots');
const { differences } = require('./helpers/diff');

const stored = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'snapshots', name), 'utf8'));
const HINT = 'If this change is intended, run `npm run snapshots:update`, review the diff and commit it.';

function expectSame(expected, actual, what) {
    const diffs = differences(expected, plain(actual));
    if (diffs.length) assert.fail(`${what} changed:\n  - ${diffs.join('\n  - ')}\n${HINT}`);
}

test('command definitions match the committed snapshot', () => {
    expectSame(stored('commands.json'), buildCommandSnapshot(), 'Registered command payload');
});

test('routing and permission inventory matches the committed snapshot', async () => {
    expectSame(stored('inventory.json'), await buildInventory(), 'Routing/permission inventory');
});

test('commands are registered to a single guild (not globally)', () => {
    assert.equal(buildCommandSnapshot().registration, 'guild');
});
