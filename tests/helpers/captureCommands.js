// Preload for deploy-commands.js: captures the command payload instead of sending it to Discord.
// Class choices come from ~/5etools-src on disk, so they are replaced with a fixed placeholder.
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    const loaded = originalLoad.apply(this, arguments);
    if (/leagueStarterItems$/.test(request) && loaded && !loaded.__stubbed) {
        loaded.buildClassChoices = () => [{ name: 'class choices (from 5etools-src, not snapshotted)', value: 'stub' }];
        loaded.__stubbed = true;
    }
    return loaded;
};

const { REST } = require('discord.js');
REST.prototype.put = async function (route, options) {
    process.stdout.write('COMMANDS_JSON_START\n' + JSON.stringify({ route, body: options.body }) + '\nCOMMANDS_JSON_END\n');
    process.exit(0);
};
