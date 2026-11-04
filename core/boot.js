const { createRegistry } = require('./registry');
const { createRouter } = require('./router');

// The interaction kinds the new router handles. Phase 3 moves them over one at a time (selects and modals
// are done; buttons, then commands, are next); the old routers in interactions/ keep the rest until each is retired.
// Both index.js and the route-permission test harness call this, so the harness exercises exactly what runs live.
const MIGRATED = ['select', 'userSelect', 'modal'];

function boot(client) {
    const registry = createRegistry(require('../manifests'));   // any manifest problem stops startup, listing all of them
    createRouter(registry, { only: MIGRATED }).install(client);
}
boot.MIGRATED = MIGRATED;

module.exports = boot;
