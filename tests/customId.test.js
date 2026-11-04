require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { root } = require('./helpers/repo');
const { getButtonRoutes } = require('./helpers/snapshots');
const { routesOfKinds } = require('./helpers/registryRoutes');

const encoders = [
    ['directLineId', 'dl'],
    ['questDashboardId', 'questDash'],
    ['tableAdminDashboardId', 'tableAdmin'],
    ['ticketId', 'ticket'],
].map(([file, prefix]) => ({ file, prefix, ...require(path.join(root, 'interactions', file)) }));

for (const enc of encoders) {
    test(`${enc.file}: encode then decode round-trips`, () => {
        const cases = [['A-1', 'open'], ['A-1', 'open', 7], ['A-1', 'open', 'x'], ['A-1', 'open', null]];
        for (const [id, action, extra] of cases) {
            const decoded = Object.values(enc.decodeId(enc.encodeId(id, action, extra)));
            assert.deepEqual(decoded, [id, action, extra == null ? undefined : String(extra)]);
        }
    });

    test(`${enc.file}: uses the "${enc.prefix}:" prefix and rejects bad input`, () => {
        assert.equal(enc.PREFIX, enc.prefix);
        assert.equal(enc.encodeId('A-1', 'go'), `${enc.prefix}:A-1:go`);
        assert.throws(() => enc.encodeId('', 'go'));
        assert.throws(() => enc.encodeId('A-1', ''));
        assert.throws(() => enc.decodeId('other:A-1:go'));
    });

    test(`${enc.file}: enforces Discord's 100-character limit`, () => {
        const fits = 'x'.repeat(100 - `${enc.prefix}::go`.length);
        assert.equal(enc.encodeId(fits, 'go').length, 100);
        assert.throws(() => enc.encodeId(fits + 'x', 'go'), /100-char/);
    });

    test(`${enc.file}: documents current behaviour - a ":" inside the extra part is cut off on decode`, () => {
        assert.equal(enc.decodeId(enc.encodeId('A-1', 'go', 'a:b')).extra, 'a');
    });
}

test('every encoder prefix is handled by at least one router', () => {
    const { prefix } = getButtonRoutes();
    const chains = [...routesOfKinds(['select', 'userSelect']), ...routesOfKinds(['modal'])];
    for (const enc of encoders) {
        const sample = `${enc.prefix}:A-1:go`;
        const inButtons = prefix.some(p => sample.startsWith(p.key));
        const inChains = chains.some(c => c.match === 'prefix' && sample.startsWith(c.value));
        assert.ok(inButtons || inChains, `${enc.prefix}: is not routed by any button prefix, select or modal pattern`);
    }
});
