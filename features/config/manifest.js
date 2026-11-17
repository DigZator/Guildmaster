const { routes } = require('../../core/manifest');
const config = require('./command');
const configButtons = require('./buttons');
const configCommand = require('./configCommand');

module.exports = {
    name: 'config',
    init,   // see the bottom of this file
    commands: [{
        // Enforced by the router (Admins role), with the router's default refusal text.
        name: 'config', policy: 'admin', handler: config,
        // Enforced by the router: anyone who is not an admin is offered an empty list.
        autocomplete: [{ name: 'key', policy: 'admin', handle: (i) => configCommand.autocomplete(i) }],
    }],
    buttons: { prefix: routes('open', configButtons.prefix, { gate: 'admin' }) },
};

// Starts what this feature runs by itself (listeners, schedulers, watchers). core/boot.js calls it once when the bot starts;
// the modules load only then, so loading the manifest (tests, deploy tooling) starts nothing.
function init(client) {
    require('../../core/mappingCheck').init(client);
}
