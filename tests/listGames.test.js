// /list_games: who sees the games that are not released yet. This is a view, not a refusal, so the route-permission
// snapshot cannot show it (a refusal and a listing both come back as "deferReply"); these tests pin it directly.
const { testEnv } = require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyFilters, canSeeUnreleased, buildEmbed } = require('../utils/listGamesHelper');

const ROLE = { admin: testEnv.ADMINS_ROLE_ID, hr: testEnv.HR_ROLE_ID, cmd: testEnv.CMD_ROLE_ID };
const CTRL = testEnv.GUILDMASTER_CTRL_CHANNEL_ID;
const LEAGUE = testEnv.LEAGUE_ADMIN_CHANNEL_ID;
const ELSEWHERE = '300000000000000999';

const caller = (roles, channelId = ELSEWHERE, discordAdmin = false) => ({
    member: { roles: { cache: roles.map(id => ({ id })) } },
    channel: { id: channelId }, channelId,
    memberPermissions: { has: () => discordAdmin },
});

const game = (title, show) => ({ title, show, activate: true, openSeats: 3, format: 'Online', type: 'Adventure', system: '5e', level: '3', experienceLevel: 'Tier 1', date: 'Sat', createdTime: show ? 2 : 1 });
const GAMES = [game('Released game', true), game('Unreleased game', false)];

const WHO = {
    'the Admins role': [caller([ROLE.admin]), true],
    'the Admins role in the control channel': [caller([ROLE.admin], CTRL), true],
    'nobody': [caller([]), false],
    'nobody in the control channel': [caller([], CTRL), false],
    'nobody in the league-admin channel': [caller([], LEAGUE), false],
    'HR': [caller([ROLE.hr]), false],
    'CMD': [caller([ROLE.cmd]), false],
    'the Discord Administrator permission alone': [caller([], ELSEWHERE, true), false],
};

test('only the Admins role sees the unreleased view; the control channel and Discord Administrator alone do not', () => {
    for (const [label, [interaction, expected]] of Object.entries(WHO)) {
        assert.equal(canSeeUnreleased(interaction), expected, label);
    }
});

test('what each kind of member is shown: everyone gets released games, only the Admins role also gets the unreleased one', () => {
    for (const [label, [interaction, expected]] of Object.entries(WHO)) {
        const shown = applyFilters(GAMES, { browsing: true, isAdmin: canSeeUnreleased(interaction) }).map(g => g.title);
        assert.deepEqual(shown.sort(), expected ? ['Released game', 'Unreleased game'] : ['Released game'], label);
    }
});

test('the [HIDDEN] marker appears only in the admin view', () => {
    const adminView = buildEmbed(applyFilters(GAMES, { browsing: true, isAdmin: true }), 0, true).embed.data.description;
    const playerView = buildEmbed(applyFilters(GAMES, { browsing: true, isAdmin: false }), 0, false).embed.data.description;
    assert.match(adminView, /\[HIDDEN\] .*Unreleased game/);
    assert.doesNotMatch(playerView, /HIDDEN|Unreleased game/);
    // Even if an unreleased game reached the player view, the marker is only ever printed for admins.
    const unfilteredPlayerView = buildEmbed(GAMES, 0, false).embed.data.description;
    assert.doesNotMatch(unfilteredPlayerView, /HIDDEN/);
});
