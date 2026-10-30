const crypto = require('crypto');
const { FETCH_ATTEMPTS, RETRY_BASE_MS } = require('./constants');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = text => crypto.createHash('sha1').update(String(text ?? '').trim()).digest('hex').slice(0, 12);
const byId = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1);
const fileKey = files => files.map(([name, size]) => `${name}:${size}`).sort().join('|');
const filesOf = message => [...message.attachments.values()].map(a => [a.name, a.size]);
const messageLink = (guildId, channelId, messageId) => `https://discord.com/channels/${guildId}/${channelId}${messageId ? `/${messageId}` : ''}`;

function isRetryable(err) {
    const status = err?.status;
    return !status || status >= 500 || status === 429;
}

async function withRetry(fn, { attempts = FETCH_ATTEMPTS, baseMs = RETRY_BASE_MS } = {}) {
    let lastError;
    for (let n = 1; n <= attempts; n++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (!isRetryable(err) || n === attempts) break;
            await sleep(baseMs * 2 ** (n - 1));
        }
    }
    throw lastError;
}

module.exports = {
    sleep,
    sha,
    byId,
    fileKey,
    filesOf,
    messageLink,
    withRetry,
};
