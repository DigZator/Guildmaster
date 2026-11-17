// The named constant for ephemeral replies (plan step D4) must stay exactly the number Discord expects, and the
// source must not go back to the bare number (the lint rule "no-restricted-syntax" in eslint.config.js forbids it).
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { ESLint, Linter } = require('eslint');
const path = require('path');
const { root } = require('./helpers/repo');
const { EPHEMERAL } = require('../shared/utilities/ephemeral');

test('EPHEMERAL is the number 64, which is discord.js MessageFlags.Ephemeral', () => {
    assert.equal(EPHEMERAL, 64);
    assert.equal(EPHEMERAL, MessageFlags.Ephemeral);
});

test('lint refuses a bare 64 as a flags value, in any shape, and accepts the constant', async () => {
    const config = (await new ESLint({ cwd: root }).calculateConfigForFile(path.join(root, 'features/games/newFile.js')));
    const messages = (code) => new Linter({ cwd: root, configType: 'flat' }).verify(code, [{ languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs' }, rules: { 'no-restricted-syntax': config.rules['no-restricted-syntax'] } }], { filename: path.join(root, 'features/games/newFile.js') });
    assert.equal(messages("x.reply({ content: 'a', flags: 64 });").length, 1);
    assert.equal(messages("x.deferReply({ flags: isPublic ? 0 : 64 });").length, 1);
    assert.equal(messages("x.deferReply({ flags : 64 });").length, 1);
    assert.deepEqual(messages("x.reply({ content: 'a', flags: EPHEMERAL }); const BATCH_SIZE = 64; y({ size: 64 });"), []);
});
