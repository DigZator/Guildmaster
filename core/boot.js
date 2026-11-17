const { createRegistry } = require('./registry');
const { createRouter } = require('./router');

// The interaction kinds the router handles: selects, modals, buttons and commands (which includes autocomplete).
// index.js calls this to start the bot; the route-permission and autocomplete test harnesses call it with
// `start: false`, so they exercise exactly the router that runs live.
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
