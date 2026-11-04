const { routes } = require('../core/manifest');
const config = require('../commands/config');
const configButtons = require('../buttons/config');
const configCommand = require('../utils/configCommand');

module.exports = {
    name: 'config',
    commands: [{
        name: 'config', policy: 'open', gate: 'admin', handler: config,
        // The handler itself answers with an empty list unless the caller is an admin.
        autocomplete: [{ name: 'key', policy: 'open', gate: 'admin', handle: (i) => configCommand.autocomplete(i) }],
    }],
    buttons: { prefix: routes('open', configButtons.prefix, { gate: 'admin' }) },
};
