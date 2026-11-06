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
require('./flow/announcementFlow')(client);
require('./flow/editGameArtFlow')(client);
require('./flow/tlrSubmissionFlow')(client);
require('./core/boot')(client);
require('./features/messaging/rss/flow')(client);
require('./utils/cacheWatcher').init(client);
require('./utils/cacheAlert').init(client);
require('./utils/registrationDefaults').init(client);
require('./utils/scheduler').init(client);
require('./utils/restockScheduler').init(client);
require('./utils/threadActivityReport').init(client);
require('./utils/keepAlive').initListeners(client);
require('./utils/trapChannel')(client);
require('./utils/deactivator').init(client);
require('./features/tickets/dashboardWatcher').init(client);
require('./features/tickets/mentions').init(client);
require('./utils/verificationWatcher').init(client);
require('./utils/memorialReindex').init(client);
require('./utils/channelFileReview').init(client);
require('./utils/mappingCheck').init(client);

const token = process.env.DISCORD_TOKEN;

const { refreshCache } = require('./utils/cache');
client.once('clientReady', () => refreshCache());

client.login(token);
