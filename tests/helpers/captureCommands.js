// Preload for deploy-commands.js: captures the command payload instead of sending it to Discord.
// Class choices come from ~/5etools-src on disk, so they are replaced with a fixed placeholder (./stubClassChoices).
require('./stubClassChoices');

const { REST } = require('discord.js');
REST.prototype.put = async function (route, options) {
    process.stdout.write('COMMANDS_JSON_START\n' + JSON.stringify({ route, body: options.body }) + '\nCOMMANDS_JSON_END\n');
    process.exit(0);
};
