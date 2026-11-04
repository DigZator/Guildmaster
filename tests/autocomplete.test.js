// Autocomplete had no tests at all. This fires an autocomplete for every command, subcommand and option, as
// three kinds of member, through the real routers (offline), and compares what happened with the committed
// snapshot. It exists so the autocomplete logic can move from the old command router into the manifests
// without changing which handler runs or what is offered.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAutocompleteSnapshot } = require('./helpers/snapshots');
const committed = require('./snapshots/autocomplete.json');
const definitions = require('./snapshots/commands.json').commands;

const actual = buildAutocompleteSnapshot();
const entry = (route) => actual.entries.find(e => e.route === route);
const answersFor = (route, persona) => {
    const e = entry(route);
    assert.ok(e, `no autocomplete fire for "${route}"`);
    const key = Object.keys(e.results).find(k => e.results[k].includes(persona));
    return key;
};

test('autocomplete: what each option does matches the committed snapshot', () => {
    assert.deepEqual(actual, committed);
});

test('autocomplete: every option the commands declare as autocomplete gets an answer', () => {
    let count = 0;
    const walk = (node, trail) => {
        for (const opt of node.options || []) {
            if (opt.autocomplete) {
                count++;
                const route = `${trail.join(' ')}  [focused: ${opt.name}]`;
                const e = entry(route) ?? actual.entries.find(x => x.route.startsWith(`${trail.join(' ')}  [focused: ${opt.name}`));
                assert.ok(e, `no fire for ${route}`);
                assert.ok(Object.keys(e.results).some(k => !k.endsWith('no response')), `${route} never answers`);
            }
            walk(opt, [...trail, opt.name]);
        }
    };
    for (const cmd of definitions) walk(cmd, [cmd.name]);
    assert.equal(count, 36);
});

test('autocomplete: a plain option on a subcommand with no autocomplete routing gets no answer', () => {
    for (const route of ['league profile  [focused: user]', 'league edit  [focused: name]', 'league edit  [focused: class]']) {
        assert.ok(Object.keys(entry(route).results).every(k => k.startsWith('(no handler) | no response')), route);
    }
});

// The old router often chooses by command or subcommand, not by which option is focused (for example every
// option of "league shop buy" gets the catalogue). Discord only asks for autocomplete on options flagged as
// autocomplete, so this is harmless, but it is today's behavior and the manifests reproduce it.
test('documents current behavior: several commands answer whatever option is focused', () => {
    assert.match(answersFor('league shop buy  [focused: zz-not-an-option]', 'nobody'), /^catalogueAutocomplete/);
    assert.match(answersFor('anon_msg add  [focused: zz-not-an-option]', 'nobody'), /alpha-key/);
    assert.match(answersFor('announce_game  [focused: zz-not-an-option]', 'nobody'), /^gameAutocomplete/);
});

// ── documents current behavior: see POST_REFACTOR.md, issue 1 ────────────────
// Nothing checks permissions on autocomplete today (except /config, inline). These tests pin that so the fix
// is a deliberate, visible change: when it lands, update them together with the snapshot.
test('documents current behavior: a member with no roles is offered game titles, the queue and anonymous keys', () => {
    assert.match(answersFor('announce_game  [focused: game]', 'nobody'), /^gameAutocomplete \|/);
    assert.match(answersFor('schedule_activation add  [focused: game]', 'nobody'), /Open Game \(1 Jan\)=u-open/);
    assert.match(answersFor('schedule_activation remove  [focused: game]', 'nobody'), /Queued Game=u-queued/);
    assert.match(answersFor('anon_msg rmv  [focused: key]', 'nobody'), /alpha-key/);
    assert.match(answersFor('ticket reset_counter  [focused: type]', 'nobody'), /s-one/);
});

test('documents current behavior: schedule_activation add offers only games that are not activated yet', () => {
    const text = answersFor('schedule_activation add  [focused: game]', 'nobody');
    assert.ok(!/Live Game/.test(text));
});

test('/config autocomplete is the one that checks: only the admin role is offered keys', () => {
    assert.match(answersFor('config set  [focused: key]', 'nobody'), /\(empty list\)$/);
    assert.match(answersFor('config set  [focused: key]', 'control channel only'), /\(empty list\)$/);
    assert.match(answersFor('config set  [focused: key]', 'admin role'), /BOT_LOG_CHANNEL_ID/);
});

test('a branch with its own condition: edit_game offers games for "game" and fields for "field"', () => {
    assert.match(answersFor('edit_game  [focused: game]', 'nobody'), /^gameAutocomplete/);
    assert.match(answersFor('edit_game  [focused: field]', 'nobody'), /Title=Title/);
});

test('help family: asks for a group first, then lists that group', () => {
    assert.match(answersFor('help  [focused: family]', 'nobody'), /Pick a group first/);
    assert.match(answersFor('help  [focused: family, group=help]', 'nobody'), /About Help=about/);
});
