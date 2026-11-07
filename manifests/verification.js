const { route, routes } = require('../core/manifest');
const verification = require('../features/verification/command');
const verificationButtons = require('../features/verification/buttons');

const ownVerify = { gate: 'own: roles and Discord permissions (utils/verificationService.js)' };

module.exports = {
    name: 'verification',
    // Enforced by the router with the Admins role OR the Discord Administrator permission (not a plain admin gate:
    // anyone Discord lets administer the server has always passed). The refusal text is the command's own.
    commands: [{ name: 'verification', policy: 'admin_or_discord_admin', denied: '❌ You don\'t have permission to run this.', handler: verification }],
    buttons: {
        exact: routes('open', verificationButtons.exact, ownVerify),
        prefix: {
            ...routes('open', verificationButtons.prefix, ownVerify),
            // The pager of /verification pending: same rule as the command, its own refusal text.
            'verification:pending:': route('admin_or_discord_admin', verificationButtons.prefix['verification:pending:'], { denied: '❌ You don\'t have permission to do that.' }),
        },
    },
    modals: { exact: { 'verification:modal': route('open', (i, c) => require('../features/verification/buttons').handleModalSubmit(i, c), ownVerify) } },
};
