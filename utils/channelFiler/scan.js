const fs = require('fs');
const { ChannelType } = require('discord.js');
const { THREAD_TYPES } = require('../channelFileGuards');
const { NO_MESSAGES_TYPES } = require('./constants');
const { sha, byId, fileKey, filesOf, withRetry } = require('./helpers');

// ─── Reading sources ────────────────────────────────────────────────────────
function hasMessages(channel) {
    return !NO_MESSAGES_TYPES.includes(channel.type);
}

async function* pagesOf(channel, { pageSize = 100 } = {}) {
    let after = '0';
    let joined = false;

    while (true) {
        let batch;
        try {
            batch = await withRetry(() => channel.messages.fetch({ limit: pageSize, after, cache: false }));
        } catch (err) {
            if (!joined && THREAD_TYPES.includes(channel.type) && channel.joinable) {
                joined = true;
                await channel.join();
                continue;
            }
            throw err;
        }

        if (!batch.size) return;
        const page = [...batch.values()].sort(byId);
        yield page;
        after = page[page.length - 1].id;
        if (batch.size < pageSize) return;
    }
}

async function listThreads(target, { includePrivateArchived }) {
    if (!target.threads?.fetchActive) return [];
    const found = new Map();

    const active = await withRetry(() => target.threads.fetchActive());
    for (const thread of active.threads.values()) found.set(thread.id, thread);

    const sweep = async options => {
        let before;
        while (true) {
            const res = await withRetry(() => target.threads.fetchArchived({ ...options, limit: 100, before }));
            for (const thread of res.threads.values()) found.set(thread.id, thread);
            if (!res.hasMore || !res.threads.size) break;
            before = res.threads.last();
        }
    };
    await sweep({ type: 'public' });
    if (includePrivateArchived) await sweep({ type: 'private', fetchAll: true });

    return [...found.values()]
        .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
        .map(thread => ({ thread, isPrivate: thread.type === ChannelType.PrivateThread }));
}

async function scanIds(client, channelId) {
    let channel;
    try {
        channel = await client.channels.fetch(channelId);
    } catch (err) {
        if (err.status === 404 || err.code === 10003) return null;
        throw err;
    }
    if (!channel) return null;

    const ids = new Set();
    for await (const page of pagesOf(channel)) for (const message of page) ids.add(message.id);
    return ids;
}

// ─── Posting ────────────────────────────────────────────────────────────────
function sizeOfFile(builder) {
    const data = builder.attachment;
    return Buffer.isBuffer(data) ? data.length : fs.statSync(data).size;
}

async function readPostedRange(thread, entries) {
    const found = new Map();
    const lastId = BigInt(entries[entries.length - 1].id);
    let after = (BigInt(entries[0].id) - 1n).toString();

    while (true) {
        const batch = await withRetry(() => thread.messages.fetch({ limit: 100, after, cache: false }));
        if (!batch.size) break;
        const page = [...batch.values()].sort(byId);
        for (const message of page) found.set(message.id, { h: sha(message.content), files: filesOf(message) });
        after = page[page.length - 1].id;
        if (BigInt(after) >= lastId || batch.size < 100) break;
    }
    return found;
}

const postMatches = (found, entry) => Boolean(found) && found.h === entry.h && fileKey(found.files) === fileKey(entry.files);

module.exports = {
    hasMessages,
    pagesOf,
    listThreads,
    scanIds,
    sizeOfFile,
    readPostedRange,
    postMatches,
};
