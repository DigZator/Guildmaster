const ping = require('./ping');
const keepAlive = require('./keepAlive/command');
const help = require('./help');
const helpAutocomplete = require('./helpAutocomplete');

// /ping, /keep_alive and /help are open to everyone. (/keep_alive for Adventurers only is a separate, later change.)
module.exports = {
    name: 'general',
    commands: [
        { name: 'ping', policy: 'open', handler: ping },
        { name: 'keep_alive', policy: 'open', handler: keepAlive },
        { name: 'help', policy: 'open', handler: help, autocomplete: [{ name: 'family', policy: 'open', handle: helpAutocomplete }] },
    ],
};
