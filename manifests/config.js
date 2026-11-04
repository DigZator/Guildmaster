const { routes } = require('../core/manifest');
const config = require('../commands/config');
const configButtons = require('../buttons/config');

module.exports = {
    name: 'config',
    commands: [{ name: 'config', policy: 'open', gate: 'admin', handler: config }],
    buttons: { prefix: routes('open', configButtons.prefix, { gate: 'admin' }) },
};
