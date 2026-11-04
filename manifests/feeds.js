const { routes } = require('../core/manifest');
const rss = require('../commands/rss');
const anon_msg = require('../commands/anon_msg');
const schedule_activation = require('../commands/schedule_activation');
const anonMessages = require('../buttons/anonMessages');

const adminCtrl = (name, handler) => ({ name, policy: 'open', gate: 'admin_ctrl', handler });

module.exports = {
    name: 'feeds',
    commands: [adminCtrl('rss', rss), adminCtrl('anon_msg', anon_msg), adminCtrl('schedule_activation', schedule_activation)],
    buttons: {
        exact: routes('open', anonMessages.exact),
        prefix: routes('open', anonMessages.prefix),
    },
};
