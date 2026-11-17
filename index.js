require('dotenv').config();
require('./core/channelMap').applyToEnv();
const client = require('./client');

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('error', (error) => {    
    console.error('Process error:', error);
});

require('./core/roleVars').report();

// Installs the router and starts every feature's own listeners, schedulers and watchers (manifest `init`).
require('./core/boot')(client);

const token = process.env.DISCORD_TOKEN;

const { refreshCache } = require('./shared/data-access/cache');
client.once('clientReady', () => refreshCache());

client.login(token);
