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

const token = process.env.DISCORD_TOKEN;

client.login(token);