const { route, routes } = require('../core/manifest');
const channelFile = require('../commands/channelFile');
const channelFileButtons = require('../buttons/channelFile');

module.exports = {
    name: 'channelFile',
    commands: [{
        name: 'channel_file', policy: 'open', gate: 'admin', handler: channelFile,
        subcommands: { file: { policy: 'open', gate: 'cmd' } },   // protect add/remove/list: admin; file: cmd
    }],
    buttons: { prefix: routes('open', channelFileButtons.prefix, { gate: 'cmd' }) },
    modals: { prefix: { 'channelFile:': route('open', (i, c) => require('../buttons/channelFile').handleModal(i, c), { gate: 'cmd' }) } },
};
