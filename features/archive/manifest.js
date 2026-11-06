const { routes } = require('../../core/manifest');
const archive = require('./command');
const archiveConfig = require('./configCommand');
const archiveButtons = require('./buttons');

// Enforced by the router; the refusal is the router's default text, which is what each handler used to say.
const admin = (name, handler) => ({ name, policy: 'admin', handler });

module.exports = {
    name: 'archive',
    commands: [
        admin('archive', archive),
        admin('archive-config', archiveConfig),
    ],
    buttons: {
        exact: routes('open', archiveButtons.exact),
        // archive_confirm_*: Admins only, enforced by the router (a deliberate change, plan item 15).
        prefix: routes('admin', archiveButtons.prefix),
    },
};
