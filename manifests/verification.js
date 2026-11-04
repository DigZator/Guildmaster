const { route, routes } = require('../core/manifest');
const verification = require('../commands/verification');
const verificationButtons = require('../buttons/verification');

const ownVerify = { gate: 'own: roles and Discord permissions (utils/verificationService.js)' };

module.exports = {
    name: 'verification',
    commands: [{ name: 'verification', policy: 'open', gate: 'admin', handler: verification }],
    buttons: {
        exact: routes('open', verificationButtons.exact, ownVerify),
        prefix: {
            ...routes('open', verificationButtons.prefix, ownVerify),
            'verification:pending:': route('open', verificationButtons.prefix['verification:pending:'], { gate: 'admin' }),
        },
    },
    modals: { exact: { 'verification:modal': route('open', (i, c) => require('../buttons/verification').handleModalSubmit(i, c), ownVerify) } },
};
