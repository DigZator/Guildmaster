// The /league router: which handler each group and subcommand reaches, with the arguments it passes. Every handler is
// replaced by a recorder, so nothing touches Notion or Discord.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

const HANDLERS = {
    '../features/league/notion': ['getActiveCharacter'],
    '../features/league/inventory/button': ['sendInventory'],
    '../features/league/inventory/helper': ['sendItemDetail'],
    '../features/league/shop': ['leagueShop', 'leagueMarketplace'],
    '../features/league/quests/command': ['listQuests'],
    '../features/league/downtime/command': ['leagueDowntime'],
    '../features/league/starterItems/command': ['leagueStarterItems'],
    '../features/league/void': ['leagueVoid'],
    '../features/league/character/profile': ['handleCreate', 'showProfile', 'setCharacterArt', 'editCharacter'],
    '../features/league/gold': ['transferGold', 'showBalance'],
    '../features/league/leaderboard/command': ['showLeaderboard'],
    '../features/league/quests/log': ['showQuestLog'],
    '../features/league/character/status': ['changeCharacterStatus'],
    '../features/league/dashboard/dashboard': ['buildDashboardEmbed', 'buildDashboardRows'],
};

function loadRouter(calls) {
    const saved = [];
    for (const [rel, names] of Object.entries(HANDLERS)) {
        const file = require.resolve(rel);
        saved.push([file, require.cache[file]]);
        const exports = {};
        for (const n of names) {
            exports[n] = (...args) => {
                calls.push([n, args.length, args.slice(1)]);
                if (n === 'getActiveCharacter') return Promise.resolve({ id: 'char' });
                if (n === 'buildDashboardEmbed') return 'EMBED';
                if (n === 'buildDashboardRows') return ['ROWS'];
                return 'handled:' + n;
            };
        }
        require.cache[file] = { id: file, filename: file, loaded: true, exports };
    }
    const routerFile = require.resolve('../commands/league/command');
    delete require.cache[routerFile];
    const { league } = require(routerFile);
    return { league, restore() { delete require.cache[routerFile]; for (const [f, old] of saved) { if (old) require.cache[f] = old; else delete require.cache[f]; } } };
}

function interaction(group, sub) {
    const replies = [];
    return {
        replies, user: { id: 'u1' },
        options: { getSubcommandGroup: () => group, getSubcommand: () => sub },
        reply: async (a) => { replies.push(['reply', a]); return 'replied'; },
        deferReply: async (a) => { replies.push(['deferReply', a]); },
        editReply: async (a) => { replies.push(['editReply', a]); return 'edited'; },
    };
}

test('the /league router sends every group and subcommand to its handler', async () => {
    const calls = [];
    const { league, restore } = loadRouter(calls);
    const client = { tag: 'client' };
    const table = [
        ['shop', 'browse'], ['shop', 'buy'], ['marketplace', 'list'], ['downtime', 'start'], ['quest', 'list'], ['quest', 'other'],
        ['void', 'item'], ['character', 'status'], ['character', 'other'],
        [null, 'create'], [null, 'profile'], [null, 'edit'], [null, 'setart'], [null, 'inv'], [null, 'item'], [null, 'gold'],
        [null, 'balance'], [null, 'starter-items'], [null, 'log'], [null, 'leaderboard'], [null, 'dashboard'], [null, 'nonsense'],
    ];
    const out = {};
    try {
        for (const [group, sub] of table) {
            calls.length = 0;
            const i = interaction(group, sub);
            const result = await league(i, client);
            out[`${group}:${sub}`] = { result, calls: calls.map(([n, argc, rest]) => [n, argc, rest.map(r => (r === client ? 'client' : typeof r))]), replies: i.replies };
        }
    } finally { restore(); }
    assert.deepEqual(out, {
        'shop:browse': { result: 'handled:leagueShop', calls: [['leagueShop', 1, []]], replies: [] },
        'shop:buy': { result: 'handled:leagueShop', calls: [['leagueShop', 1, []]], replies: [] },
        'marketplace:list': { result: 'handled:leagueMarketplace', calls: [['leagueMarketplace', 1, []]], replies: [] },
        'downtime:start': { result: 'handled:leagueDowntime', calls: [['leagueDowntime', 1, []]], replies: [] },
        'quest:list': { result: 'handled:listQuests', calls: [['listQuests', 1, []]], replies: [] },
        'quest:other': { result: undefined, calls: [], replies: [] },
        'void:item': { result: 'handled:leagueVoid', calls: [['leagueVoid', 1, []]], replies: [] },
        'character:status': { result: 'handled:changeCharacterStatus', calls: [['changeCharacterStatus', 1, []]], replies: [] },
        'character:other': { result: 'replied', calls: [], replies: [['reply', { content: 'Unknown subcommand.', flags: 64 }]] },
        'null:create': { result: 'handled:handleCreate', calls: [['handleCreate', 1, []]], replies: [] },
        'null:profile': { result: 'handled:showProfile', calls: [['showProfile', 1, []]], replies: [] },
        'null:edit': { result: 'handled:editCharacter', calls: [['editCharacter', 1, []]], replies: [] },
        'null:setart': { result: 'handled:setCharacterArt', calls: [['setCharacterArt', 2, ['client']]], replies: [] },
        'null:inv': { result: 'handled:sendInventory', calls: [['sendInventory', 1, []]], replies: [] },
        'null:item': { result: 'handled:sendItemDetail', calls: [['sendItemDetail', 1, []]], replies: [] },
        'null:gold': { result: 'handled:transferGold', calls: [['transferGold', 1, []]], replies: [] },
        'null:balance': { result: 'handled:showBalance', calls: [['showBalance', 1, []]], replies: [] },
        'null:starter-items': { result: 'handled:leagueStarterItems', calls: [['leagueStarterItems', 1, []]], replies: [] },
        'null:log': { result: 'handled:showQuestLog', calls: [['showQuestLog', 1, []]], replies: [] },
        'null:leaderboard': { result: 'handled:showLeaderboard', calls: [['showLeaderboard', 2, ['client']]], replies: [] },
        'null:dashboard': {
            result: 'edited',
            calls: [['getActiveCharacter', 1, []], ['buildDashboardEmbed', 1, []], ['buildDashboardRows', 1, []]],
            replies: [['deferReply', { flags: 64 }], ['editReply', { embeds: ['EMBED'], components: ['ROWS'] }]],
        },
        'null:nonsense': { result: 'replied', calls: [], replies: [['reply', { content: 'Unknown subcommand.', flags: 64 }]] },
    });
});
