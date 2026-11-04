const { route, routes } = require('../core/manifest');
const verification = require('../commands/verification');
const verificationButtons = require('../buttons/verification');

const ownVerify = { gate: 'own: roles and Discord permissions (utils/verificationService.js)' };

module.exports = {
    name: 'verification',
    // NOT a plain admin gate: utils/verificationAdmin.js also lets in anyone with the Discord Administrator permission.
    commands: [{ name: 'verification', policy: 'open', gate: 'own: Admins role OR Discord Administrator permission (utils/verificationAdmin.js)', handler: verification }],
    buttons: {
        exact: routes('open', verificationButtons.exact, ownVerify),
        prefix: {
            ...routes('open', verificationButtons.prefix, ownVerify),
            'verification:pending:': route('open', verificationButtons.prefix['verification:pending:'], { gate: 'admin' }),
        },
    },
    modals: { exact: { 'verification:modal': route('open', (i, c) => require('../buttons/verification').handleModalSubmit(i, c), ownVerify) } },
};
