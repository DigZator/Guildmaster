// shared/auth must reproduce today's access checks exactly. The old helpers stay in place until Phase 3,
// so this test runs both against the same inputs and demands identical answers.
require('./helpers/env');
const CLERK = '200000000000000010';
process.env.CLERK_OF_MORTAL_AFFAIRS_ROLE_ID = CLERK; // before tlrRoles loads
const test = require('node:test');
const assert = require('node:assert/strict');
const { testEnv } = require('./helpers/env');
const { isAdminChannel, ADMIN_CONFIG } = require('../utils/isAdminChannel');
const { isTlrMod } = require('../config/tlrRoles');
const auth = require('../shared/auth');
const { ROLE_VARS } = require('../config/roleVars');

const ROLE = { admin: testEnv.ADMINS_ROLE_ID, hr: testEnv.HR_ROLE_ID, cmd: testEnv.CMD_ROLE_ID, clerk: CLERK, other: '200000000000000999' };
const CTRL = testEnv.GUILDMASTER_CTRL_CHANNEL_ID;
const LEAGUE = testEnv.LEAGUE_ADMIN_CHANNEL_ID;
const ELSEWHERE = '300000000000000999';

const roleSets = {
    'no roles': [], admin: [ROLE.admin], hr: [ROLE.hr], cmd: [ROLE.cmd], clerk: [ROLE.clerk],
    'admin+hr': [ROLE.admin, ROLE.hr], 'other only': [ROLE.other],
};
const places = {
    'control channel': { channel: { id: CTRL } },
    'league channel': { channel: { id: LEAGUE } },
    elsewhere: { channel: { id: ELSEWHERE } },
    'thread in control': { channel: { id: ELSEWHERE, parentId: CTRL, isThread: () => true } },
    'thread in league': { channel: { id: ELSEWHERE, parentId: LEAGUE, isThread: () => true } },
    'thread elsewhere': { channel: { id: ELSEWHERE, parentId: ELSEWHERE, isThread: () => true } },
    'uncached channel (id only)': { channelId: CTRL },
    'no channel info': {},
};
function everyone() {
    const out = [];
    for (const [r, roles] of Object.entries(roleSets)) {
        for (const [p, place] of Object.entries(places)) {
            out.push({ label: `${r} / ${p}`, interaction: { member: { roles: { cache: roles.map(id => ({ id })) } }, ...place } });
        }
    }
    out.push({ label: 'no member', interaction: { ...places.elsewhere } });
    out.push({ label: 'member without roles', interaction: { member: {}, ...places['control channel'] } });
    return out;
}

const legacyToPolicy = Object.fromEntries(Object.values(auth.POLICIES).filter(p => p.legacy).map(p => [p.legacy, p.name]));

test('every old isAdminChannel type has exactly one matching policy', () => {
    assert.deepEqual(Object.keys(legacyToPolicy).sort(), Object.keys(ADMIN_CONFIG).sort());
});

for (const [legacy, policy] of Object.entries(legacyToPolicy)) {
    test(`policy "${policy}" answers exactly like isAdminChannel "${legacy}" for every role/channel combination`, () => {
        for (const { label, interaction } of everyone()) {
            assert.equal(auth.can(policy, interaction), isAdminChannel(interaction, legacy), `${legacy} / ${label}`);
        }
    });
}

test('the ADMIN_CHECK_MODE_* overrides behave like the old modes, including the typo fallback', () => {
    for (const [legacy, envName] of [['bot', 'ADMIN_CHECK_MODE_BOT'], ['league', 'ADMIN_CHECK_MODE_LEAGUE']]) {
        const original = ADMIN_CONFIG[legacy].mode;
        try {
            for (const mode of ['role', 'channel', 'either', 'both', 'bogus']) {
                ADMIN_CONFIG[legacy].mode = mode;
                const env = { ...process.env, [envName]: mode };
                for (const { label, interaction } of everyone()) {
                    assert.equal(auth.can(legacy === 'bot' ? 'bot_legacy' : 'league_legacy', interaction, env), isAdminChannel(interaction, legacy), `${legacy} mode ${mode} / ${label}`);
                }
            }
        } finally { ADMIN_CONFIG[legacy].mode = original; }
    }
});

test('policy "tlr_mod" answers exactly like isTlrMod', () => {
    for (const { label, interaction } of everyone()) {
        assert.equal(auth.can('tlr_mod', interaction), isTlrMod(interaction.member), label);
    }
    assert.equal(auth.can('tlr_mod', { member: { roles: { cache: [{ id: ROLE.clerk }] } } }), true);
    assert.equal(auth.can('tlr_mod', { member: { roles: { cache: [{ id: ROLE.hr }] } } }), false);
});

test('"open" lets everyone through, even an interaction with no member', () => {
    for (const { interaction } of everyone()) assert.equal(auth.can('open', interaction), true);
    assert.equal(auth.can('open', {}), true);
});

test('a role variable that is not set denies instead of matching everyone', () => {
    const env = { ...process.env }; delete env.HR_ROLE_ID;
    const interaction = { member: { roles: { cache: [{ id: undefined }, { id: ROLE.hr }] } }, channel: { id: ELSEWHERE } };
    assert.equal(auth.can('hr', interaction, env), false);
});

test('an unknown policy name throws instead of silently denying', () => {
    assert.throws(() => auth.can('adimn', { member: {} }), /Unknown policy "adimn"/);
    assert.throws(() => auth.getPolicy('nonsense'), /Known policies:/);
});

test('validate() finds nothing wrong with the shipped policies and test environment', () => {
    assert.deepEqual(auth.validate(), []);
});

test('validate() reports unknown roles, unknown channels, bad combine modes and bad ADMIN_CHECK_MODE values', () => {
    const bad = {
        a: { name: 'a', who: ['MADE_UP_ROLE_ID'], where: [], combine: 'role' },
        b: { name: 'b', who: [], where: ['nowhere'], combine: 'channel' },
        c: { name: 'c', who: [], where: [], combine: 'sometimes' },
        d: { name: 'd', who: [], where: ['ctrl'], combine: 'either', modeEnv: 'ADMIN_CHECK_MODE_BOT' },
    };
    const problems = auth.validate(bad, { ADMIN_CHECK_MODE_BOT: 'eithr' });
    assert.equal(problems.length, 4, problems.join('\n'));
    assert.match(problems.join('\n'), /MADE_UP_ROLE_ID/);
    assert.match(problems.join('\n'), /nowhere/);
    assert.match(problems.join('\n'), /sometimes/);
    assert.match(problems.join('\n'), /eithr/);
});

test('every role a policy uses is registered in config/roleVars.js', () => {
    const registered = new Set(ROLE_VARS.map(entry => entry.key));
    for (const policy of Object.values(auth.POLICIES)) {
        for (const key of policy.who) assert.ok(registered.has(key), `${policy.name}: ${key}`);
    }
});

test('policies are frozen so nothing can loosen one at runtime', () => {
    assert.throws(() => { 'use strict'; auth.POLICIES.admin.combine = 'open'; }, TypeError);
    assert.throws(() => { 'use strict'; auth.POLICIES.admin.who.push('HR_ROLE_ID'); }, TypeError);
});
