require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    try {
        const channel = await client.channels.fetch(process.env.LEAGUE_ADMIN_CHANNEL_ID);
        if (!channel) {
            console.error('Could not find LEAGUE_ADMIN_CHANNEL_ID');
            process.exit(1);
        }

        const thread = await channel.threads.create({
            name: 'Character Art Archive',
            autoArchiveDuration: 10080, // 7 days, will stay open as long as bot posts
            reason: 'Permanent storage for character art images',
        });

        console.log(`✅ Thread created: ${thread.name}`);
        console.log(`Thread ID: ${thread.id}`);
        console.log(`\nAdd this to your .env file:\nLEAGUE_ART_ARCHIVE_THREAD_ID=${thread.id}`);
    } catch (err) {
        console.error('Error creating thread:', err);
    }
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
