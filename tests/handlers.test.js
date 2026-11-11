// Each command must still run the handler it ran before. The manifests wire a command name to a handler function;
// this compares a hash of each handler's source (require paths blanked, so a moved file is not a change) with the
// committed snapshot. If a handler is changed on purpose, run `npm run snapshots:update` and review the diff.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHandlerSnapshot } = require('./helpers/snapshots');
const committed = require('./snapshots/handlers.json');

test('handlers: every command runs the handler recorded in the snapshot', () => {
    assert.deepEqual(buildHandlerSnapshot(), committed);
});

test('handlers: the snapshot covers every registered command and no handler is empty', () => {
    const names = Object.keys(committed.commands);
    assert.ok(names.length >= 24, `only ${names.length} commands recorded`);
    for (const [name, hash] of Object.entries(committed.commands)) assert.match(hash, /^[0-9a-f]{12}$/, name);
    assert.equal(new Set(Object.values(committed.commands)).size, names.length, 'two commands share a handler hash: one of them is probably wired to the wrong handler');
});
