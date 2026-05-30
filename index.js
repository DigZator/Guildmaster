require('dotenv').config();
const client = require('./client');

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('error', (error) => {    
    console.error('Process error:', error);
});

require('./interactions/commandHandler')(client);
require('./interactions/buttonHandler')(client);
require('./interactions/modalHandler')(client);
require('./flow/announcementFlow')(client);
require('./flow/tlrSubmissionFlow')(client);
require('./interactions/selectHandler')(client);
require('./flow/rssFlow')(client);
require('./utils/cacheWatcher').init(client);
require('./utils/scheduler').init(client);

const token = process.env.DISCORD_TOKEN;

const { refreshCache } = require('./utils/cache');
client.once('clientReady', () => refreshCache());

client.login(token);
