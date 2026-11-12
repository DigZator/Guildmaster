require('dotenv').config();
require('./utils/channelMap').applyToEnv();
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

require('./config/roleVars').report();

require('./interactions/threadAlertLog')(client);
require('./features/games/announcementFlow')(client);
require('./features/games/editGameArtFlow')(client);
require('./features/theLongRest/submissionFlow')(client);
require('./core/boot')(client);
require('./features/messaging/rss/flow')(client);
require('./utils/cacheWatcher').init(client);
require('./utils/cacheAlert').init(client);
require('./utils/registrationDefaults').init(client);
require('./features/games/activation/scheduler').init(client);
require('./features/league/shop/restockScheduler').init(client);
require('./utils/threadActivityReport').init(client);
require('./features/general/keepAlive/job').initListeners(client);
require('./utils/trapChannel')(client);
require('./features/games/activation/deactivator').init(client);
require('./features/tickets/dashboardWatcher').init(client);
require('./features/tickets/mentions').init(client);
require('./features/verification/watcher').init(client);
require('./features/theLongRest/memorialReindex').init(client);
require('./features/channelFile/review').init(client);
require('./utils/mappingCheck').init(client);

const token = process.env.DISCORD_TOKEN;

const { refreshCache } = require('./utils/cache');
client.once('clientReady', () => refreshCache());

client.login(token);
