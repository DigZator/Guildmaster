const { routes } = require('../core/manifest');
const config = require('../commands/config');
const configButtons = require('../buttons/config');
const configCommand = require('../utils/configCommand');

module.exports = {
    name: 'config',
    commands: [{
        // Enforced by the router (Admins role), with the router's default refusal text.
        name: 'config', policy: 'admin', handler: config,
        // Enforced by the router: anyone who is not an admin is offered an empty list.
        autocomplete: [{ name: 'key', policy: 'admin', handle: (i) => configCommand.autocomplete(i) }],
    }],
    buttons: { prefix: routes('open', configButtons.prefix, { gate: 'admin' }) },
};
