const { routes } = require('../core/manifest');
const direct_line = require('../commands/direct_line');
const directLine = require('../buttons/directLine');

module.exports = {
    name: 'directLine',
    // The command is enforced by the router (HR role only; the Admins role does not pass).
    commands: [{ name: 'direct_line', policy: 'hr', denied: '❌ Only HR can use this command.', handler: direct_line }],
    // The dl: buttons check that the record exists BEFORE the HR check, so their check stays in the handler.
    buttons: { prefix: routes('open', directLine.prefix, { gate: 'hr' }) },
};
