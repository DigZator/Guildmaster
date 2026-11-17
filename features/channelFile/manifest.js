const { route, routes } = require('../../core/manifest');
const channelFile = require('./command');
const channelFileButtons = require('./buttons');

const NOT_ALLOWED = '❌ You do not have permission to use this.';

module.exports = {
    name: 'channelFile',
    init,   // see the bottom of this file
    // All enforced by the router. protect add/remove/list: Admins role; file: the CMD role. The command and its
    // subcommands refuse with the router's default text; the review buttons and the Proceed form say "...use this."
    commands: [{
        name: 'channel_file', policy: 'admin', handler: channelFile,
        subcommands: { file: { policy: 'cmd' } },
    }],
    buttons: { prefix: routes('cmd', channelFileButtons.prefix, { denied: NOT_ALLOWED }) },
    modals: { prefix: { 'channelFile:': route('cmd', (i, c) => require('./buttons').handleModal(i, c), { denied: NOT_ALLOWED }) } },
};

// Starts what this feature runs by itself (listeners, schedulers, watchers). core/boot.js calls it once when the bot starts;
// the modules load only then, so loading the manifest (tests, deploy tooling) starts nothing.
function init(client) {
    require('./review').init(client);
}
