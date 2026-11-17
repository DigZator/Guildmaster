// What each feature starts when the bot starts (plan section 8.3, C1). index.js only calls core/boot.js; boot installs the
// router and then runs every manifest's `init(client)` in the order of manifests/index.js. This pins which listeners each
// feature registers (a fake client records them; nothing is started because the schedulers wait for 'clientReady'),
// and that the whole set is the same one index.js used to start by hand: 35 registrations in total.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { root, read } = require('./helpers/repo');

const READY = ['once:clientReady', 'on:clientReady'];   // client.once() registers through client.on() too
const EXPECTED = {
    general: ['on:threadCreate', ...READY, 'on:threadUpdate', 'on:threadDelete', 'on:messageCreate'],
    games: ['on:messageCreate', 'on:messageCreate', ...READY, ...READY, ...READY],
    messaging: [...READY],
    theLongRest: ['on:messageCreate', ...READY],
    tickets: [...READY, ...READY],
    channelFile: [...READY],
    verification: [...READY, 'on:guildMemberAdd', 'on:guildMemberRemove', 'on:guildMemberUpdate'],
    config: [...READY],
    league: [...READY],
};

// The recording happens in a child process (tests/helpers/startupWiringCli.js): loading the real modules starts background
// work, so it runs offline and exits explicitly, like the other helpers that load every manifest.
function startedByEachFeature() {
    const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers/startupWiringCli.js')], { cwd: root, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
    const match = (child.stdout || '').match(/STARTUP_JSON_START([\s\S]*?)STARTUP_JSON_END/);
    if (!match) throw new Error('Could not record the startup listeners:\n' + (child.stderr || '').slice(0, 800));
    return JSON.parse(match[1]);
}

test('every feature that runs something by itself starts exactly these listeners, in manifest order', () => {
    const got = startedByEachFeature();
    assert.deepEqual(got.map(g => g.owner), Object.keys(EXPECTED));
    assert.deepEqual(Object.fromEntries(got.map(g => [g.owner, g.listeners])), EXPECTED);
});

test('the features together register the same 35 listeners the old index.js did by hand', () => {
    const total = Object.values(EXPECTED).flat();
    assert.equal(total.length, 35 - 1);   // the 35th is the router's interactionCreate, installed by boot itself
    const count = (event) => total.filter(e => e === event).length;
    assert.equal(count('on:messageCreate'), 4);
    assert.equal(count('once:clientReady'), 12);
    assert.equal(count('on:clientReady'), 12);
});

test('index.js starts the bot through core/boot only, with no feature startup lines of its own', () => {
    const lines = read('index.js').split('\n').filter(l => /\)\(client\)|\.init\(client\)|initListeners\(client\)/.test(l) && !l.trim().startsWith('//'));
    assert.deepEqual(lines.map(l => l.trim()), ["require('./core/boot')(client);"]);
});

test('boot runs the manifest inits after it installs the router', () => {
    const src = read('core/boot.js');
    assert.ok(src.indexOf('.install(client)') !== -1 && src.indexOf('.install(client)') < src.indexOf('registry.inits'));
    assert.ok(root);
});
