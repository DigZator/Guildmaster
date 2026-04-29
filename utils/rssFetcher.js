const Parser = require('rss-parser');
const { EmbedBuilder } = require('discord.js');
const { getFeeds, updateFeed } = require('./rssStore');

const parser = new Parser();

async function pollFeed(feed, client) {
    let parsed;

    try {
        parsed = await parser.parseURL(feed.url);
    } catch (err) {
        console.error(`RSS poll failed for ${feed.name}:`, err);
        try {
            const channel = await client.channels.fetch(feed.channelId);
            await channel.send(`⚠️ **${feed.name}** — longer than expected drought spotted.`);
        } catch (channelErr) {
            console.error(`Could not warn in channel for ${feed.name}:`, channelErr);
        }
        return;
    }

    // Sort oldest first so we post in chronological order
    const items = parsed.items
        .map(item => ({
            title:     item.title,
            link:      item.link,
            unix:      item.isoDate ? Math.floor(new Date(item.isoDate).getTime() / 1000) : Math.floor(Date.now() / 1000),
            summary:   item.contentSnippet || item.summary || '',
            thumbnail: item.enclosure?.url || item['media:content']?.['$']?.url || null,
        }))
        .filter(item => item.unix > feed.lastPostUnix)
        .sort((a, b) => a.unix - b.unix);

    if (!items.length) return;

    const channel = await client.channels.fetch(feed.channelId);

    for (const item of items) {
        const embed = new EmbedBuilder()
            .setTitle(item.title)
            .setURL(item.link)
            .setDescription(item.summary.slice(0, 300) || null)
            .setFooter({ text: feed.name })
            .setTimestamp(item.unix * 1000);

        if (item.thumbnail) embed.setImage(item.thumbnail);

        await channel.send({ embeds: [embed] });
    }

    // Update to the newest item
    const newest = items[items.length - 1];
    updateFeed(feed.url, { lastPostTitle: newest.title, lastPostUnix: newest.unix });
}

async function pollAllFeeds(client) {
    const feeds = getFeeds();
    for (const feed of feeds) {
        await pollFeed(feed, client);
    }
}

module.exports = { pollAllFeeds };