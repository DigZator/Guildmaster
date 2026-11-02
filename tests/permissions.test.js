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

// --- section 6.3: the channel check reads channelId and treats a thread as its parent channel ---

const inChannel = (roles, channelId, extra = {}) => ({
    member: { roles: { cache: roles.map(id => ({ id })) } },
    channelId,
    channel: null,
    ...extra,
});
const thread = (parentId, id = '300000000000000777') => ({ id, parentId, isThread: () => true });

test('an uncached channel no longer throws: channelId alone decides', () => {
    assert.equal(isAdminChannel(inChannel([], CTRL), 'bot'), true);
    assert.equal(isAdminChannel(inChannel([], ELSEWHERE), 'bot'), false);
    assert.equal(isAdminChannel(inChannel([ROLE.admin], ELSEWHERE), 'bot'), true);
    assert.equal(isAdminChannel({ member: { roles: { cache: [] } }, channel: null }, 'bot'), false);
    assert.equal(isAdminChannel({ member: { roles: { cache: [] } }, channel: null }, 'botAdmin'), false);
});

test('a thread inside the control channel counts as the control channel', () => {
    const t = thread(CTRL);
    assert.equal(isAdminChannel(inChannel([], t.id, { channel: t }), 'bot'), true);
    assert.equal(isAdminChannel(inChannel([], t.id, { channel: t }), 'league'), true);
    assert.equal(isAdminChannel(inChannel([ROLE.admin], t.id, { channel: t }), 'botChannelAdmin'), true);
    assert.equal(isAdminChannel(inChannel([], t.id, { channel: t }), 'botChannelAdmin'), false, 'the role is still required');
});

test('a thread inside the league-admin channel counts as the league-admin channel (league only)', () => {
    const t = thread(LEAGUE);
    assert.equal(isAdminChannel(inChannel([], t.id, { channel: t }), 'league'), true);
    assert.equal(isAdminChannel(inChannel([], t.id, { channel: t }), 'bot'), false);
});

test('a thread under some other channel grants nothing', () => {
    const t = thread(ELSEWHERE);
    for (const type of ['bot', 'league', 'botAdmin', 'botChannelAdmin', 'hr', 'cmd']) {
        assert.equal(isAdminChannel(inChannel([], t.id, { channel: t }), type), false, type);
    }
});

test('role-only types ignore the channel, threads included', () => {
    const t = thread(CTRL);
    assert.equal(isAdminChannel(inChannel([], t.id, { channel: t }), 'botAdmin'), false);
    assert.equal(isAdminChannel(inChannel([ROLE.admin], ELSEWHERE), 'botAdmin'), true);
});

test('the old shape (channel.id only, no channelId) still works', () => {
    assert.equal(isAdminChannel(who([], CTRL), 'bot'), true);
    assert.equal(isAdminChannel(who([], ELSEWHERE), 'bot'), false);
});
