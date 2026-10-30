const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { AttachmentBuilder } = require('discord.js');
const { downloadAttachment: downloadToFile } = require('./downloadAttachment');

const DISCORD_CHUNK_LIMIT = 2000;
const CHUNK_SIZE = DISCORD_CHUNK_LIMIT - 10;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const GROUP_GAP_MS = 5 * 60 * 1000;

const TEMP_ROOT = path.join(__dirname, '../temp');
const FILES_PER_MESSAGE = 10;
const DOWNLOAD_TIMEOUT_MS = 20 * 1000;
const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_RETRY_BASE_MS = 1000;
const DOWNLOAD_CONCURRENCY = 3;
const MB = 1024 * 1024;

const MEMORY_BATCH_MAX_BYTES = 32 * MB;

const UNKNOWN_SIZE_ESTIMATE = 2 * MB;
const MIN_FREE_DISK_BYTES = 50 * MB;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Time helpers (IST) ─────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const toIst = ms => new Date(ms + IST_OFFSET_MS);

function formatDate(ms) {
    const d = toIst(ms);
    return `${DAYS[d.getUTCDay()]} ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatTime(ms) {
    const d = toIst(ms);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatStamp(ms) {
    return `${formatDate(ms)}, ${formatTime(ms)}`;
}

const dayKey = ms => formatDate(ms);

function formatSize(bytes) {
    if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function uploadLimitBytes(guild) {
    const tier = guild?.premiumTier ?? 0;
    if (tier >= 3) return 95 * MB;
    if (tier === 2) return 48 * MB;
    return 9.5 * MB;
}

// ─── History ────────────────────────────────────────────────────────────────
async function fetchFullHistory(channel) {
    const messages = [];
    let lastId;

    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (batch.size === 0) break;
        messages.push(...batch.values());
        lastId = batch.last().id;
        if (batch.size < 100) break;
    }

    return messages.reverse();
}

// ─── Rendering ──────────────────────────────────────────────────────────────
function authorName(message) {
    return message.member?.displayName || message.author?.username || message.author?.id || 'Unknown';
}

function renderEmbed(embed) {
    const type = embed.data?.type ?? embed.type;
    if (type && type !== 'rich') return [];

    const lines = [];
    if (embed.title) lines.push(`**${embed.title}**`);
    if (embed.description) lines.push(...embed.description.split('\n'));
    for (const field of embed.fields ?? []) {
        lines.push(`**${field.name}:** ${field.value}`);
    }
    if (embed.footer?.text) lines.push(`-# ${embed.footer.text}`);

    return lines.map(line => `> ${line}`);
}

function nameFromUrl(url, fallback) {
    try {
        const base = path.basename(new URL(url).pathname);
        return base && base.includes('.') ? base : fallback;
    } catch {
        return fallback;
    }
}

function renderHistory(history, {
    preserveAttachments = false,
    maxFileBytes = 0,
    maxAttachments = Infinity,
    includeEmbedImages = false,
    labelSystemMessages = false,
} = {}, state = {}) {
    const lines = [];
    const attachmentGroups = [];
    const notPreserved = [];
    const lost = [];
    let fileCount = state.fileCount ?? 0;

    let lastDay = state.lastDay ?? null;
    let lastAuthorId = state.lastAuthorId ?? null;
    let lastTimestamp = state.lastTimestamp ?? 0;

    for (const message of history) {
        const ts = message.createdTimestamp;
        const name = authorName(message);

        const newDay = dayKey(ts) !== lastDay;
        const newGroup = newDay
            || message.author?.id !== lastAuthorId
            || ts - lastTimestamp > GROUP_GAP_MS;

        if (newDay) {
            if (lines.length) lines.push('');
            lines.push(`**── ${formatDate(ts)} ──**`, '');
            lastDay = dayKey(ts);
        } else if (newGroup) {
            lines.push('');
        }
        if (newGroup) lines.push(`**${name}** · ${formatTime(ts)}`);

        lastAuthorId = message.author?.id;
        lastTimestamp = ts;

        let hasBody = false;

        if (message.content?.length) {
            lines.push(...message.content.split('\n'));
            hasBody = true;
        }

        for (const embed of message.embeds ?? []) {
            const embedLines = renderEmbed(embed);
            if (embedLines.length) {
                lines.push(...embedLines);
                hasBody = true;
            }
        }

        const files = [];
        const considerFile = ({ label, name: fileName, url, size, extra = {} }) => {
            hasBody = true;

            let problem = null;
            if (!preserveAttachments) problem = 'not preserved';
            else if (fileCount >= maxAttachments) problem = `not preserved — more than ${maxAttachments} files`;
            else if (size > maxFileBytes) problem = 'not preserved — too large to repost';

            if (problem) {
                const reason = problem.replace('not preserved — ', '');
                lines.push(`${label} — ${problem}`);
                notPreserved.push(`${fileName} (${reason})`);
                lost.push({ name: fileName, size, reason, messageId: message.id, channelId: message.channelId });
            } else {
                lines.push(`${label} — reposted below`);
                files.push({ name: fileName, url, size, ...extra, messageId: message.id, channelId: message.channelId });
                fileCount++;
            }
        };

        for (const attachment of message.attachments?.values() ?? []) {
            considerFile({
                label: `📎 ${attachment.name} (${formatSize(attachment.size)})`,
                name: attachment.name,
                url: attachment.url,
                size: attachment.size,
                extra: { id: attachment.id },
            });
        }

        if (includeEmbedImages) {
            for (const [index, embed] of [...(message.embeds ?? [])].entries()) {
                const type = embed.data?.type ?? embed.type;
                if (type && type !== 'rich') continue;
                for (const key of ['image', 'thumbnail']) {
                    const url = embed[key]?.url;
                    if (!url || url.startsWith('attachment://')) continue;
                    const fileName = nameFromUrl(url, `${message.id}-${index}-${key}.png`);
                    considerFile({
                        label: `🖼️ ${fileName} (embed ${key})`,
                        name: fileName,
                        url,
                        size: 0,
                        extra: { sizeUnknown: true, embedRef: { index, key } },
                    });
                }
            }
        }

        if (files.length) {
            attachmentGroups.push({ label: `**${name}** · ${formatStamp(ts)}`, files });
        }

        for (const sticker of message.stickers?.values() ?? []) {
            lines.push(`🏷️ Sticker: ${sticker.name}`);
            hasBody = true;
        }

        if (!hasBody) lines.push(labelSystemMessages && message.system ? '*[system message]*' : '*[no text]*');
    }

    state.lastDay = lastDay;
    state.lastAuthorId = lastAuthorId;
    state.lastTimestamp = lastTimestamp;
    state.fileCount = fileCount;

    return { lines, attachmentGroups, notPreserved, lost };
}

function buildHeaderLines({ header, meta = [], closeReason, closeFeedback }) {
    const lines = [];
    if (header) lines.push(`## ${header}`);

    const rows = meta.length
        ? meta
        : [
            closeReason ? ['Close reason', closeReason] : null,
            closeFeedback?.length ? ['Close feedback', closeFeedback] : null,
        ].filter(Boolean);

    for (const [label, value] of rows) {
        if (value !== null && value !== undefined && value !== '') lines.push(`**${label}:** ${value}`);
    }

    lines.push('-# All times are IST', '', '### 💬 Transcript', '');
    return lines;
}

// ─── Chunking ───────────────────────────────────────────────────────────────
function splitOverlongLine(line, limit) {
    const pieces = [];
    let rest = line;
    while (rest.length > limit) {
        let cut = rest.lastIndexOf(' ', limit);
        if (cut <= 0) cut = limit;
        pieces.push(rest.slice(0, cut));
        rest = rest.slice(cut).trimStart();
    }
    pieces.push(rest);
    return pieces;
}

function chunkLines(lines, limit = CHUNK_SIZE) {
    const chunks = [];
    let current = '';

    const flush = () => {
        if (current.trim()) chunks.push(current);
        current = '';
    };

    for (const raw of lines) {
        for (const line of (raw.length > limit ? splitOverlongLine(raw, limit) : [raw])) {
            const joined = current ? `${current}\n${line}` : line;
            if (joined.length > limit) {
                flush();
                current = line;
            } else {
                current = joined;
            }
        }
    }
    flush();

    return keepFencesBalanced(chunks);
}

function keepFencesBalanced(chunks) {
    let open = false;
    return chunks.map(chunk => {
        let text = open ? `\`\`\`\n${chunk}` : chunk;
        const fences = (chunk.match(/```/g) ?? []).length;
        if (fences % 2 === 1) open = !open;
        if (open) text += '\n```';
        return text;
    });
}

// ─── Public API ─────────────────────────────────────────────────────────────
async function buildTranscript(channel, { header, meta, closeReason, closeFeedback, preserveAttachments = false, maxAttachments } = {}) {
    const history = await fetchFullHistory(channel);
    const maxFileBytes = uploadLimitBytes(channel.guild);
    const rendered = renderHistory(history, { preserveAttachments, maxFileBytes, maxAttachments });

    const lines = [...buildHeaderLines({ header, meta, closeReason, closeFeedback }), ...rendered.lines];

    return {
        chunks: chunkLines(lines),
        attachmentGroups: rendered.attachmentGroups,
        notPreserved: rendered.notPreserved,
    };
}

async function buildTranscriptChunks(channel, options = {}) {
    const { chunks } = await buildTranscript(channel, { ...options, preserveAttachments: false });
    return chunks;
}

// ─── Attachment staging ─────────────────────────────────────────────────────
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function safeFileName(name) {
    return String(name ?? 'file').replace(/[^\w.\-]+/g, '_').slice(-100) || 'file';
}

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}

async function fetchBuffer(url, { maxBytes, timeoutMs = DOWNLOAD_TIMEOUT_MS } = {}) {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declared = Number(response.headers?.get?.('content-length'));
    if (maxBytes && declared && declared > maxBytes) throw new Error('File is too large');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (maxBytes && buffer.length > maxBytes) throw new Error('File is too large');
    return buffer;
}

function sizeMismatch(file, actual) {
    return !file.sizeUnknown && Number.isFinite(file.size) && file.size > 0 && actual !== file.size
        ? new Error(`Size mismatch (${actual} of ${file.size} bytes)`)
        : null;
}

async function withStaging(file, { refreshUrl, attempts = DOWNLOAD_ATTEMPTS, retryBaseMs = DOWNLOAD_RETRY_BASE_MS }, attempt, cleanup = () => {}) {
    let lastError;
    for (let n = 1; n <= attempts; n++) {
        try {
            let url = file.url;
            if (refreshUrl) {
                try { url = (await refreshUrl(file, n)) || file.url; } catch { url = file.url; }
            }
            return await attempt(url);
        } catch (err) {
            lastError = err;
            cleanup();
            if (n < attempts) await sleep(retryBaseMs * 3 ** (n - 1));
        }
    }
    throw lastError;
}

function stageBuffer(file, { fetchBuffer: fetcher = fetchBuffer, maxBytes, timeoutMs, ...retry } = {}) {
    return withStaging(file, retry, async url => {
        const buffer = await fetcher(url, { maxBytes: maxBytes ?? Math.max(file.size, 1), timeoutMs });
        const mismatch = sizeMismatch(file, buffer.length);
        if (mismatch) throw mismatch;
        return buffer;
    });
}

function stageFile(file, dir, index, { download = downloadToFile, maxBytes, timeoutMs = DOWNLOAD_TIMEOUT_MS, ...retry } = {}) {
    const dest = path.join(dir, `${index}-${safeFileName(file.name)}`);
    return withStaging(file, retry, async url => {
        await download(url, dest, { maxBytes: maxBytes ?? Math.max(file.size, 1), timeoutMs });
        const mismatch = sizeMismatch(file, fs.statSync(dest).size);
        if (mismatch) throw mismatch;
        return dest;
    }, () => fs.rmSync(dest, { force: true })).then(() => dest);
}

function estimatedSize(file) {
    return file.sizeUnknown ? UNKNOWN_SIZE_ESTIMATE : file.size;
}

function packBatches(files, limit) {
    const batches = [];
    let current = [];
    let bytes = 0;
    for (const file of files) {
        const size = estimatedSize(file);
        if (current.length && (current.length >= FILES_PER_MESSAGE || bytes + size > limit)) {
            batches.push(current);
            current = [];
            bytes = 0;
        }
        current.push(file);
        bytes += size;
    }
    if (current.length) batches.push(current);
    return batches;
}

function freeDiskBytes(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        const stats = fs.statfsSync(dir);
        return Number(stats.bavail) * Number(stats.bsize);
    } catch {
        return Infinity;
    }
}

async function postAttachmentGroups(thread, groups, {
    initialNotPreserved = [],
    send = payload => thread.send(payload),
    tempDir,
    refreshUrl,
    download,
    fetchBuffer: fetcher,
    retryBaseMs,
    timeoutMs,
    header = true,
} = {}) {
    const allowedMentions = { parse: [] };
    const workDir = tempDir ?? path.join(TEMP_ROOT, `transcript-${randomUUID()}`);
    const notPreserved = [...initialNotPreserved];
    const failures = [];
    const limit = uploadLimitBytes(thread.guild);
    let reposted = 0;

    const fail = (file, reason) => {
        notPreserved.push(`${file.name} (${reason})`);
        failures.push({ file, reason });
    };

    if (header && groups.length) {
        try {
            await send({ content: '### 📎 Attachments', allowedMentions });
        } catch (err) {
            console.warn('[ticketTranscript] Could not post attachments header:', err.message);
        }
    }

    for (const group of groups) {
        const batches = packBatches(group.files, limit);

        for (let i = 0; i < batches.length; i++) {
            const label = i === 0 ? group.label : `${group.label} (continued)`;
            const batch = batches[i];
            const useDisk = batch.reduce((sum, file) => sum + estimatedSize(file), 0) > MEMORY_BATCH_MAX_BYTES;

            if (useDisk && freeDiskBytes(path.dirname(workDir)) < MIN_FREE_DISK_BYTES + limit) {
                for (const file of batch) fail(file, 'not enough free disk space');
                continue;
            }
            if (useDisk) fs.mkdirSync(workDir, { recursive: true });

            const staged = await mapLimit(batch, DOWNLOAD_CONCURRENCY, async (file, n) => {
                try {
                    const common = { refreshUrl, retryBaseMs, maxBytes: limit, timeoutMs };
                    return useDisk
                        ? { file, filePath: await stageFile(file, workDir, `${i}-${n}`, { ...common, download }) }
                        : { file, buffer: await stageBuffer(file, { ...common, fetchBuffer: fetcher }) };
                } catch (error) {
                    return { file, error };
                }
            });

            const ready = [];
            for (const item of staged) {
                if (item.error) {
                    console.warn(`[ticketTranscript] Could not download ${item.file.name}:`, item.error.message);
                    fail(item.file, 'download failed');
                } else {
                    ready.push(item);
                }
            }

            try {
                if (!ready.length) continue;

                const toAttachment = ({ file, filePath, buffer }) => new AttachmentBuilder(filePath ?? buffer, { name: file.name });

                try {
                    await send({ content: label, files: ready.map(toAttachment), allowedMentions });
                    reposted += ready.length;
                } catch (err) {
                    console.warn('[ticketTranscript] Batch upload failed, retrying individually:', err.message);
                    for (const item of ready) {
                        try {
                            await send({ content: label, files: [toAttachment(item)], allowedMentions });
                            reposted += 1;
                        } catch (singleErr) {
                            console.warn(`[ticketTranscript] Could not upload ${item.file.name}:`, singleErr.message);
                            fail(item.file, 'upload failed');
                        }
                    }
                }
            } finally {
                for (const { filePath } of ready) if (filePath) fs.rmSync(filePath, { force: true });
            }
        }
    }

    fs.rmSync(workDir, { recursive: true, force: true });

    if (notPreserved.length) {
        const list = notPreserved.map(entry => `• ${entry}`).join('\n');
        try {
            await send({ content: `### ⚠️ Not preserved\n${list}`.slice(0, 2000), allowedMentions });
        } catch (err) {
            console.warn('[ticketTranscript] Could not post the not-preserved list:', err.message);
        }
    }

    return { reposted, notPreserved, failures };
}

async function sendTranscript(thread, transcript, options = {}) {
    const allowedMentions = { parse: [] };

    for (const chunk of transcript.chunks) {
        await thread.send({ content: chunk, allowedMentions });
    }

    const { reposted, notPreserved } = await postAttachmentGroups(thread, transcript.attachmentGroups, {
        ...options,
        initialNotPreserved: transcript.notPreserved,
    });

    return { reposted, notPreserved };
}

module.exports = {
    fetchFullHistory,
    renderHistory,
    buildHeaderLines,
    chunkLines,
    packBatches,
    stageBuffer,
    stageFile,
    fetchBuffer,
    mapLimit,
    uploadLimitBytes,
    freeDiskBytes,
    formatDate,
    formatTime,
    formatStamp,
    formatSize,
    buildTranscript,
    buildTranscriptChunks,
    postAttachmentGroups,
    sendTranscript,
    MIN_FREE_DISK_BYTES,
};
