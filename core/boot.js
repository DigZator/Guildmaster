const { createRegistry } = require('./registry');
const { createRouter } = require('./router');

// The interaction kinds the new router handles. Phase 3 moves them over one at a time (selects, modals,
// buttons and commands, which includes autocomplete): every old router in interactions/ is now retired.
// Both index.js and the route-permission test harness call this, so the harness exercises exactly what runs live.
const MIGRATED = ['select', 'userSelect', 'modal', 'button', 'command'];

// `start: false` installs only the router; the route and autocomplete test harnesses use it so a fake client never starts the features.
function boot(client, { start = true } = {}) {
    const registry = createRegistry(require('../features'));   // any manifest problem stops startup, listing all of them
    createRouter(registry, { only: MIGRATED }).install(client);
    // Each feature starts what it runs by itself, in the order of features/index.js (the order inside a feature is its own).
    if (start) for (const { init } of registry.inits) init(client);
}
boot.MIGRATED = MIGRATED;

module.exports = boot;
