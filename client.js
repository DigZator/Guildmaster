const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// client.tempSubmissions = new Map();
client.announcementSessions = new Map();

module.exports = client;
