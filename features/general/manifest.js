const ping = require('./ping');
const keepAlive = require('./keepAlive/command');
const help = require('./help');
const helpAutocomplete = require('./helpAutocomplete');

// /ping, /keep_alive and /help are open to everyone. (/keep_alive for Adventurers only is a separate, later change.)
module.exports = {
    name: 'general',
    init,   // see the bottom of this file
    commands: [
        { name: 'ping', policy: 'open', handler: ping },
        { name: 'keep_alive', policy: 'open', handler: keepAlive },
        { name: 'help', policy: 'open', handler: help, autocomplete: [{ name: 'family', policy: 'open', handle: helpAutocomplete }] },
    ],
};

// Starts what this feature runs by itself (listeners, schedulers, watchers). core/boot.js calls it once when the bot starts;
// the modules load only then, so loading the manifest (tests, deploy tooling) starts nothing.
function init(client) {
    require('./threadAlertLog')(client);
    require('./threadActivityReport').init(client);
    require('./keepAlive/job').initListeners(client);
    require('./trapChannel')(client);
}
