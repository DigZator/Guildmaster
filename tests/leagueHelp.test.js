// The /help data is loaded when the bot boots. The league's help must stay plain data: loading it must not load the command
// definitions (which read the class choices from ~/5etools-src on disk) or any handler. Only deploy-commands.js needs those.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { testEnv } = require('./helpers/env');
const { root } = require('./helpers/repo');

test('loading the /help data does not load the league definitions or handlers', () => {
    const code = `
        const help = require('./helpData');
        const loaded = Object.keys(require.cache).map(f => require('path').relative(process.cwd(), f).split(require('path').sep).join('/'));
        const leaked = loaded.filter(f => /^features\\/league\\/(definitions|starterItems|notion|shop|quests|downtime|grants)\\//.test(f));
        process.stdout.write('RESULT ' + JSON.stringify({ groups: Object.keys(help), league: Object.keys(help.league), leaked }));
    `;
    const result = spawnSync(process.execPath, ['-e', code], { cwd: root, env: { ...process.env, ...testEnv }, encoding: 'utf8', timeout: 60000 });
    const match = (result.stdout || '').match(/RESULT (.*)$/);
    assert.ok(match, 'no result:\n' + (result.stderr || '').slice(0, 600));
    const { groups, league, leaked } = JSON.parse(match[1]);
    assert.deepEqual(leaked, [], 'the /help data pulled these league modules in');
    assert.deepEqual(groups, ['help', 'player', 'admin', 'league', 'leaguedm', 'leagueadmin']);
    assert.deepEqual(league, ['character', 'inventory', 'shop', 'marketplace', 'downtime', 'economy', 'quest', 'void']);
});
