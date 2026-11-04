const { routes } = require('../core/manifest');
const ping = require('../commands/ping');
const keep_alive = require('../commands/keep_alive');
const help = require('../commands/help');
const game_info = require('../commands/game_info');
const deletions = require('../buttons/confirmDelete');

module.exports = {
    name: 'misc',
    commands: [
        { name: 'ping', policy: 'open', handler: ping },
        { name: 'keep_alive', policy: 'open', handler: keep_alive },
        { name: 'help', policy: 'open', handler: help },
        { name: 'game_info', policy: 'open', handler: game_info },
    ],
    buttons: {
        // confirm_remove_ / cancel_remove_: the handler checks the person who started the removal.
        prefix: routes('open', deletions.prefix, { gate: 'own: the person who started the removal' }),
    },
};
