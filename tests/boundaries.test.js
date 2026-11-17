// The feature boundary rules of plan section 4.9 (1 to 3) are enforced by lint (tests/tools/eslintBoundaries.js).
// This pins what the rule allows and refuses, and that the whole source obeys it today.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { Linter, ESLint } = require('eslint');
const { plugin, problemWith, EXCEPTIONS } = require('./tools/eslintBoundaries');
const { root } = require('./helpers/repo');

const config = [{
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs' },
    plugins: { boundaries: plugin },
    rules: { 'boundaries/feature-boundaries': 'error' },
}];

// Lints `code` as if it were the file `asFile` (repo-relative); the required paths must be real files.
function messagesFor(asFile, code) {
    return new Linter({ cwd: root, configType: 'flat' }).verify(code, config, { filename: path.join(root, asFile) });
}

test('a feature may use shared/, its own internals and another feature\'s index.js', () => {
    assert.deepEqual(messagesFor('features/games/newFile.js', "const a = require('../../shared/data-access/jsonStore');"), []);
    assert.deepEqual(messagesFor('features/league/newFile.js', "const a = require('./help/character');"), []);
    assert.deepEqual(messagesFor('features/games/newFile.js', "const a = require('../league');"), []);
    assert.deepEqual(messagesFor('features/games/newFile.js', "const a = require('../league/index.js');"), []);
    assert.deepEqual(messagesFor('features/games/deeper/newFile.js', "const a = require('../../league');"), []);
});

test('code outside the features, and the feature list, import a feature only through its index.js', () => {
    assert.deepEqual(messagesFor('core/newFile.js', "const a = require('../features/league');"), []);
    assert.deepEqual(messagesFor('helpData.js', "const a = require('./features/league');"), []);
    const internal = messagesFor('core/newFile.js', "const a = require('../features/league/help/character');");
    assert.equal(internal.length, 1);
    assert.match(internal[0].message, /internal to the "league" feature/);
    assert.equal(messagesFor('deploy-commands.js', "require('./features/league/help/character');").length, 1);
});

test('a feature may not reach into another feature\'s internals, at any depth, top-level or lazy', () => {
    const direct = messagesFor('features/games/newFile.js', "const a = require('../league/help/character');");
    assert.equal(direct.length, 1);
    assert.match(direct[0].message, /import features\/league\/index\.js instead/);
    assert.equal(messagesFor('features/games/deeper/newFile.js', "const a = require('../../league/help/character.js');").length, 1);
    assert.equal(messagesFor('features/games/newFile.js', "function later() { return require('../league/help/character'); }").length, 1);
    assert.equal(messagesFor('features/games/newFile.js', "const a = require('../../features/league/help/character');").length, 1);
});

test('shared/ never imports a feature, not even its index.js, lazily or not', () => {
    const top = messagesFor('shared/utilities/newFile.js', "const a = require('../../features/league');");
    assert.equal(top.length, 1);
    assert.match(top[0].message, /shared\/ must not import a feature/);
    assert.equal(messagesFor('shared/auth/newFile.js', "function f() { require('../../features/games'); }").length, 1);
    assert.deepEqual(messagesFor('shared/auth/newFile.js', "const a = require('../data-access/jsonStore');"), []);
});

test('packages, non-literal requires and files that do not exist are not the rule\'s business', () => {
    assert.deepEqual(messagesFor('features/games/newFile.js', "const a = require('discord.js'); const b = require(name); const c = require('../league/doesNotExist');"), []);
});

test('problemWith agrees with the linter on plain paths', () => {
    assert.equal(problemWith('features/games/a.js', 'features/games/b.js'), null);
    assert.equal(problemWith('features/games/a.js', 'features/league/index.js'), null);
    assert.equal(problemWith('core/boot.js', 'features/index.js'), null);
    assert.match(problemWith('features/games/a.js', 'features/league/b.js'), /rules 1 and 2/);
    assert.match(problemWith('shared/a.js', 'features/league/index.js'), /rule 3/);
});

test('every recorded exception still names a real import and says why', () => {
    for (const [pair, reason] of Object.entries(EXCEPTIONS)) {
        assert.ok(typeof reason === 'string' && reason.length > 20, `${pair} needs a reason`);
        assert.ok(pair.includes(' -> '), `${pair} must be "from -> to"`);
    }
});

test('the whole source obeys the boundary rules today', async () => {
    const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [
        { ignores: ['node_modules/**', 'test/**', 'scripts/**', 'temp/**', 'tests/**'] },
        ...config,
    ] });
    const results = await eslint.lintFiles(['.']);
    const problems = results.flatMap(r => r.messages.map(m => `${path.relative(root, r.filePath)}:${m.line} ${m.message}`));
    assert.deepEqual(problems, []);
    assert.ok(results.length > 250, 'the source files were found');
});
