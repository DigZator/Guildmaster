// Every interaction kind must have exactly one router while the old ones are being retired: handled twice
// would answer twice, handled by neither would never answer. core/boot.js lists what the new router owns;
// the matching old router file must be gone, and every other old router file must still exist.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { MIGRATED } = require('../core/boot');
const { root } = require('./helpers/repo');

const OLD_ROUTER = { command: 'commandHandler', button: 'buttonHandler', modal: 'modalHandler', select: 'selectHandler', userSelect: 'selectHandler' };
const exists = (name) => fs.existsSync(path.join(root, 'interactions', `${name}.js`));

test('MIGRATED only names known interaction kinds', () => {
    for (const kind of MIGRATED) assert.ok(OLD_ROUTER[kind], kind);
});

// One entry per old router FILE (select and userSelect shared one), with the kinds it used to handle.
const oldFiles = {};
for (const [kind, file] of Object.entries(OLD_ROUTER)) (oldFiles[file] = oldFiles[file] || []).push(kind);
const retired = (kinds) => kinds.every(kind => MIGRATED.includes(kind));

test('select and userSelect move together (they shared one old router)', () => {
    assert.equal(MIGRATED.includes('select'), MIGRATED.includes('userSelect'));
});

test('an old router file exists exactly until all of its kinds have moved to the new router', () => {
    for (const [file, kinds] of Object.entries(oldFiles)) {
        assert.equal(exists(file), !retired(kinds), `${file}.js should ${retired(kinds) ? 'be gone' : 'still exist'}`);
    }
});

test('index.js starts the new router exactly once, and starts each old router only while it still exists', () => {
    const src = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    assert.equal(src.split("require('./core/boot')(client)").length - 1, 1);
    for (const [file, kinds] of Object.entries(oldFiles)) {
        assert.equal(src.includes(`require('./interactions/${file}')(client)`), !retired(kinds), `${file} in index.js`);
    }
});
