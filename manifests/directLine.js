const { routes } = require('../core/manifest');
const direct_line = require('../commands/direct_line');
const directLine = require('../buttons/directLine');

module.exports = {
    name: 'directLine',
    commands: [{ name: 'direct_line', policy: 'open', gate: 'hr', handler: direct_line }],
    buttons: { prefix: routes('open', directLine.prefix, { gate: 'hr' }) },
};
