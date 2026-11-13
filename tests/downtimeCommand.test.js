// Characterization of the /league downtime command: what each subcommand replies in the cases that need no
// outside service. Notion and the pending-action queue are stubbed; the blueprints are the tracked ones in
// data/downtimeBlueprints.json. The golden file was recorded from the code before it was split into files, so
// the split (and any later change) has to reply exactly the same. To record again on purpose:
//   GOLDEN_UPDATE=1 node --test tests/downtimeCommand.test.js
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const goldenPath = path.join(__dirname, 'snapshots', 'downtimeCommand.json');
const world = { char: null, active: [], progress: null, pending: [] };

function loadCommand() {
    const notionPath = require.resolve('../utils/leagueNotion');
    const pendingPath = require.resolve('../utils/pendingActions');
    const commandPath = require.resolve('../features/league/downtime/command');
    const realNotion = require(notionPath);
    const realPending = require.cache[pendingPath];
    const saved = { notion: realNotion, pending: realPending };
    require.cache[notionPath].exports = {
        ...realNotion,
        getActiveCharacter: async () => { if (!world.char) throw new Error('none'); return world.char; },
        getActiveDowntimeForCharacter: async () => world.active,
        getDowntimeProgressById: async () => { if (!world.progress) throw new Error('none'); return world.progress; },
    };
    require.cache[pendingPath] = { id: pendingPath, filename: pendingPath, loaded: true, exports: { addAction: () => {}, getAll: () => world.pending } };
    delete require.cache[commandPath];
    const command = require(commandPath);
    return {
        command,
        restore() {
            require.cache[notionPath].exports = saved.notion;
            if (saved.pending) require.cache[pendingPath] = saved.pending; else delete require.cache[pendingPath];
            delete require.cache[commandPath];
        },
    };
}

function fakeInteraction(sub, opts = {}) {
    const calls = [];
    return {
        calls,
        user: { id: 'u1' },
        options: {
            getSubcommand: () => sub,
            getString: (n) => opts[n] ?? null,
            getInteger: (n) => opts[n] ?? null,
        },
        deferReply: async (a) => { calls.push(['deferReply', a]); },
        editReply: async (a) => { calls.push(['editReply', JSON.parse(JSON.stringify(a))]); },
        followUp: async (a) => { calls.push(['followUp', a]); },
    };
}

const char = (props = {}) => ({ id: 'c1', properties: { ...props } });
const rich = (t) => ({ rich_text: [{ plain_text: t }] });
const num = (n) => ({ number: n });

async function run(command, sub, opts) {
    const i = fakeInteraction(sub, opts);
    await command.leagueDowntime(i);
    return i.calls;
}

test('league downtime command replies as it did before it was split into files', async () => {
    const { command, restore } = loadCommand();
    const out = {};
    try {
        const engine = require('../features/league/downtime/engine');
        const bps = Object.entries(engine.loadBlueprints());
        const plain = bps.find(([k, b]) => !engine.blueprintNeedsTierChoice(k, b) && b.category !== 'Crafting');
        const tiered = bps.find(([k, b]) => engine.blueprintNeedsTierChoice(k, b));
        assert.ok(plain && tiered);

        world.char = null;
        out.listNoCharacter = await run(command, 'list');
        out.buyNoCharacter = await run(command, 'buy-days');
        out.progressNoCharacter = await run(command, 'progress', { id: 'dta1', days: 1 });

        world.char = char({ 'Reputation Points': num(0), 'Downtime Days': num(3) });
        world.active = []; world.pending = [];
        out.listEmpty = await run(command, 'list');
        out.buyNoRep = await run(command, 'buy-days');

        world.char = char({ 'Reputation Points': num(4), 'Downtime Days': num(7) });
        out.buyOffer = await run(command, 'buy-days');

        world.active = [{ properties: { 'DTA ID': rich('00AF'), 'Activity Name': { title: [{ plain_text: 'Brew Potions' }] }, 'Days Invested': num(2), 'Days Required': num(5), Quantity: num(3), 'Spell Name': rich('Fireball'), 'Item Choice': rich('Longsword') } }];
        world.pending = [
            { id: 'p1', type: 'downtime-completion', target: { discordId: 'u1' }, payload: { quantity: 2, spellName: 'Shield', itemChoice: 'Dagger', activityName: 'Scribe' } },
            { id: 'p2', type: 'downtime-start', target: { discordId: 'u1' }, details: { tierLabel: 'Tier 2', quantity: 4, activityName: 'Craft' }, payload: { uid: 'X' } },
            { id: 'p3', type: 'downtime-start', target: { discordId: 'someone-else' }, details: {} },
        ];
        out.listFull = await run(command, 'list');

        out.activities = await run(command, 'activities');

        world.progress = null;
        out.progressMissing = await run(command, 'progress', { id: 'dta1', days: 1 });
        world.progress = { properties: { Status: { select: { name: 'Completed' } } } };
        out.progressNotInProgress = await run(command, 'progress', { id: 'dta1', days: 1 });
        world.progress = { properties: { Status: { select: { name: 'In Progress' } }, 'Days Required': num(5), 'Days Invested': num(4) } };
        out.progressTooManyDays = await run(command, 'progress', { id: 'dta1', days: 3 });
        out.progressOneDayTooMany = await run(command, 'progress', { id: 'dta1', days: 2 });
        world.progress = { properties: { Status: { select: { name: 'In Progress' } }, 'Days Required': num(9), 'Days Invested': num(1) } };
        world.char = char({ 'Downtime Days': num(1) });
        out.progressNotEnoughDays = await run(command, 'progress', { id: 'dta1', days: 2 });

        out.startUnknown = await run(command, 'start', { activity: 'no-such-activity' });
        out.startNeedsTier = await run(command, 'start', { activity: tiered[0] });
        out.startBadTier = await run(command, 'start', { activity: tiered[0], tier: 'ZZZZ' });
        out.startTierNotTaken = await run(command, 'start', { activity: plain[0], tier: 'A1' });
        out.startQuantityNotAllowed = await run(command, 'start', { activity: plain[0], quantity: 2 });

        world.char = null;
        const byKey = Object.fromEntries(bps);
        out.startCraftingWithQuantity = await run(command, 'start', { activity: 'brew-healing-potion', quantity: 2 });
        out.startPlainNoCharacter = await run(command, 'start', { activity: plain[0] });
        out.startSpellNotScroll = await run(command, 'start', { activity: plain[0], spell: 'Fireball' });
        out.startItemNotMagic = await run(command, 'start', { activity: plain[0], item: 'Longsword' });
        out.startScrollNeedsSpell = await run(command, 'start', { activity: 'scribe-spell-scroll', tier: byKey['scribe-spell-scroll'].tiers[0].id });
        out.startMagicItemNeedsItem = await run(command, 'start', { activity: 'craft-magic-item', tier: byKey['craft-magic-item'].tiers[0].id });

        const unknownSub = await run(command, 'nonsense');
        assert.deepEqual(unknownSub, []);
        assert.deepEqual(Object.keys(command).sort(), ['DAYS_PER_TOPUP', 'REP_COST_PER_TOPUP', 'handleDowntimeList', 'leagueDowntime']);
        assert.equal(command.REP_COST_PER_TOPUP, 1);
        assert.equal(command.DAYS_PER_TOPUP, 10);
    } finally {
        restore();
        world.char = null; world.active = []; world.progress = null; world.pending = [];
    }
    if (process.env.GOLDEN_UPDATE === '1') {
        fs.writeFileSync(goldenPath, JSON.stringify(out, null, 2) + '\n');
        return;
    }
    assert.deepEqual(out, JSON.parse(fs.readFileSync(goldenPath, 'utf8')));
});
