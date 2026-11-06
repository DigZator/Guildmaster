const { SEND_ATTEMPTS, BATCH_CHECK_ATTEMPTS, BATCH_CHECK_RETRY_MS, ALLOWED_MENTIONS } = require('./constants');
const { sleep, sha, withRetry } = require('./helpers');
const { sizeOfFile, readPostedRange, postMatches } = require('./scan');

function createSink(thread, stats = { checked: 0, batches: 0 }) {
    const record = [];
    let verifiedUpTo = 0;

    const send = async payload => {
        const sent = await withRetry(() => thread.send(payload), { attempts: SEND_ATTEMPTS });
        record.push({
            id: sent.id,
            h: sha(payload.content),
            files: (payload.files ?? []).map(file => [file.name, sizeOfFile(file)]),
        });
        return sent;
    };

    const edit = async (messageId, content) => {
        const message = await withRetry(() => thread.messages.fetch(messageId));
        const updated = await withRetry(() => message.edit({ content, allowedMentions: ALLOWED_MENTIONS }));
        if (sha(updated?.content) !== sha(content)) throw new Error('An edited post in the filed thread did not take effect');
        const entry = record.find(r => r.id === messageId);
        if (entry) entry.h = sha(content);
    };

    const checkpoint = async () => {
        const entries = record.slice(verifiedUpTo);
        if (!entries.length) return;

        let problems = entries;
        for (let attempt = 1; attempt <= BATCH_CHECK_ATTEMPTS; attempt++) {
            const found = await readPostedRange(thread, entries);
            problems = entries.filter(entry => !postMatches(found.get(entry.id), entry));
            if (!problems.length) break;
            if (attempt < BATCH_CHECK_ATTEMPTS) await sleep(BATCH_CHECK_RETRY_MS * attempt);
        }
        if (problems.length) {
            throw new Error(`Batch check failed: ${problems.length} of ${entries.length} post(s) in the filed thread are missing or different`);
        }

        verifiedUpTo = record.length;
        stats.checked += entries.length;
        stats.batches++;
    };

    return { thread, record, send, edit, checkpoint };
}

function createUrlRefresher(client) {
    const EXPIRY_MARGIN_MS = 15 * 60 * 1000;

    const expiringSoon = url => {
        try {
            const ex = new URL(url).searchParams.get('ex');
            return ex ? parseInt(ex, 16) * 1000 - Date.now() < EXPIRY_MARGIN_MS : false;
        } catch {
            return false;
        }
    };

    return async (file, attempt) => {
        if (!file.messageId || !file.channelId) return null;
        if (attempt === 1 && !expiringSoon(file.url)) return null;

        const channel = await client.channels.fetch(file.channelId);
        const message = await channel.messages.fetch({ message: file.messageId, force: true, cache: false });
        if (file.embedRef) return message.embeds[file.embedRef.index]?.[file.embedRef.key]?.url ?? null;
        return message.attachments.get(file.id)?.url ?? null;
    };
}

module.exports = {
    createSink,
    createUrlRefresher,
};
