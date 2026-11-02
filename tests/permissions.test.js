// Characterization of utils/isAdminChannel.js: who passes each check today.
// Some rows document behaviour the refactor plan intends to change later (see section 6).
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { testEnv } = require('./helpers/env');
const { isAdminChannel, ADMIN_CONFIG } = require('../utils/isAdminChannel');

const CTRL = testEnv.GUILDMASTER_CTRL_CHANNEL_ID;
const LEAGUE = testEnv.LEAGUE_ADMIN_CHANNEL_ID;
const ELSEWHERE = '300000000000000999';
const ROLE = { admin: testEnv.ADMINS_ROLE_ID, hr: testEnv.HR_ROLE_ID, cmd: testEnv.CMD_ROLE_ID };

const who = (roles, channelId) => ({
    member: { roles: { cache: roles.map(id => ({ id })) } },
    channel: { id: channelId },
});

const scenarios = {
    'admin role, elsewhere':        who([ROLE.admin], ELSEWHERE),
    'admin role, control channel':  who([ROLE.admin], CTRL),
    'no role, control channel':     who([], CTRL),
    'no role, league channel':      who([], LEAGUE),
    'hr role, elsewhere':           who([ROLE.hr], ELSEWHERE),
    'cmd role, elsewhere':          who([ROLE.cmd], ELSEWHERE),
    'nobody, elsewhere':            who([], ELSEWHERE),
};

// expected[type][scenario] = does the check pass?
const expected = {
    bot:             [true,  true,  true,  false, false, false, false],
    league:          [true,  true,  true,  true,  false, false, false],
    botAdmin:        [true,  true,  false, false, false, false, false],
    botChannelAdmin: [false, true,  false, false, false, false, false],
    hr:              [false, false, false, false, true,  false, false],
    cmd:             [false, false, false, false, false, true,  false],
};

for (const [type, row] of Object.entries(expected)) {
    test(`isAdminChannel "${type}" (${ADMIN_CONFIG[type].mode}) matrix`, () => {
        Object.entries(scenarios).forEach(([name, interaction], i) => {
            assert.equal(isAdminChannel(interaction, type), row[i], `${type} / ${name}`);
        });
    });
}

test('documents current behaviour: "league" is granted by the league or control channel alone, with no role', () => {
    assert.equal(isAdminChannel(who([], LEAGUE), 'league'), true);
    assert.equal(isAdminChannel(who([], CTRL), 'league'), true);
});

test('documents current behaviour: the admin role does not satisfy "hr" or "cmd"', () => {
    assert.equal(isAdminChannel(who([ROLE.admin], ELSEWHERE), 'hr'), false);
    assert.equal(isAdminChannel(who([ROLE.admin], ELSEWHERE), 'cmd'), false);
});

test('the default type is "bot"', () => {
    assert.equal(isAdminChannel(who([], CTRL)), true);
    assert.equal(isAdminChannel(who([], ELSEWHERE)), false);
});

test('an unknown type denies', () => {
    const warn = console.warn; console.warn = () => {};
    try { assert.equal(isAdminChannel(who([ROLE.admin], CTRL), 'nonsense'), false); } finally { console.warn = warn; }
});

test('modes: channel / role / both / either behave as named', () => {
    const cfg = ADMIN_CONFIG.bot; const original = cfg.mode;
    try {
        const cases = {
            channel: [false, true],  // [role only, channel only]
            role:    [true, false],
            both:    [false, false],
            either:  [true, true],
        };
        for (const [mode, [roleOnly, channelOnly]] of Object.entries(cases)) {
            cfg.mode = mode;
            assert.equal(isAdminChannel(who([ROLE.admin], ELSEWHERE), 'bot'), roleOnly, `${mode}: role only`);
            assert.equal(isAdminChannel(who([], CTRL), 'bot'), channelOnly, `${mode}: channel only`);
        }
        cfg.mode = 'both';
        assert.equal(isAdminChannel(who([ROLE.admin], CTRL), 'bot'), true, 'both: role and channel');
    } finally { cfg.mode = original; }
});

test('documents current behaviour: channel-based checks throw when the interaction has no channel', () => {
    const noChannel = { member: { roles: { cache: [] } }, channel: null };
    assert.throws(() => isAdminChannel(noChannel, 'bot'), TypeError);
    assert.equal(isAdminChannel(noChannel, 'botAdmin'), false);
});
