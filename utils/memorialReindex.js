const memorialIndex = require('./memorialIndex');
const { THE_LONG_REST_CHANNEL_ID } = require('../data/channels');

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function getSubmitterIdFromEmbed(embed) {
    const footerText = embed?.footer?.text || '';
    const match = footerText.match(/AuthorID:\s*(\d{17,19})/);
    return match ? match[1] : null;
}

async function reindexChannel(channel) {
    const entries = [];
    let before;
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await channel.messages.fetch({ limit: PAGE_SIZE, ...(before ? { before } : {}) });
        if (batch.size === 0) break;

        for (const message of batch.values()) {
            const embed = message.embeds?.[0];
            if (!embed) continue;
            const authorId = getSubmitterIdFromEmbed(embed);
            if (!authorId) continue;
            entries.push({
                messageId: message.id,
                authorId,
                characterName: embed.title || 'Unknown Character',
                postedAt: message.createdTimestamp,
            });
        }

        before = batch.last().id;
        if (batch.size < PAGE_SIZE) break;
        if (page === MAX_PAGES - 1) truncated = true;
    }

    memorialIndex.replaceAll(entries);
    return { count: entries.length, truncated };
}

function init(client) {
    client.once('clientReady', async () => {
        if (!THE_LONG_REST_CHANNEL_ID) {
            console.warn('[memorialReindex] THE_LONG_REST_CHANNEL_ID is not set — skipping startup reindex.');
            return;
        }

        try {
            const channel = await client.channels.fetch(THE_LONG_REST_CHANNEL_ID);
            if (!channel?.messages) {
                console.warn('[memorialReindex] Memorial channel is not a text channel — skipping startup reindex.');
                return;
            }
            const { count, truncated } = await reindexChannel(channel);
            console.log(`[memorialReindex] Startup reindex complete — ${count} memorial(s).${truncated ? ' (Scan cap reached; older memorials may be missing.)' : ''}`);
        } catch (err) {
            console.error('[memorialReindex] Startup reindex failed — keeping the existing index:', err.message);
        }
    });
}

module.exports = { init, reindexChannel, getSubmitterIdFromEmbed };
