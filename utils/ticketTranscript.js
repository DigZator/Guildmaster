const { AttachmentBuilder } = require('discord.js');

const DISCORD_CHUNK_LIMIT = 2000;
const CHUNK_SIZE = DISCORD_CHUNK_LIMIT - 10;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const GROUP_GAP_MS = 5 * 60 * 1000;

const MAX_ATTACHMENTS = 25;
const FILES_PER_MESSAGE = 10;
const DOWNLOAD_TIMEOUT_MS = 20 * 1000;
const MB = 1024 * 1024;

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

function renderHistory(history, { preserveAttachments = false, maxFileBytes = 0 } = {}) {
    const lines = [];
    const attachmentGroups = [];
    const notPreserved = [];
    let fileCount = 0;

    let lastDay = null;
    let lastAuthorId = null;
    let lastTimestamp = 0;

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
        for (const attachment of message.attachments?.values() ?? []) {
            hasBody = true;
            const base = `📎 ${attachment.name} (${formatSize(attachment.size)})`;

            let problem = null;
            if (!preserveAttachments) problem = 'not preserved';
            else if (fileCount >= MAX_ATTACHMENTS) problem = `not preserved — more than ${MAX_ATTACHMENTS} files`;
            else if (attachment.size > maxFileBytes) problem = 'not preserved — too large to repost';

            if (problem) {
                lines.push(`${base} — ${problem}`);
                notPreserved.push(`${attachment.name} (${problem.replace('not preserved — ', '')})`);
            } else {
                lines.push(`${base} — reposted below`);
                files.push({ name: attachment.name, url: attachment.url, size: attachment.size });
                fileCount++;
            }
        }
        if (files.length) {
            attachmentGroups.push({ label: `**${name}** · ${formatStamp(ts)}`, files });
        }

        for (const sticker of message.stickers?.values() ?? []) {
            lines.push(`🏷️ Sticker: ${sticker.name}`);
            hasBody = true;
        }

        if (!hasBody) lines.push('*[no text]*');
    }

    return { lines, attachmentGroups, notPreserved };
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
async function buildTranscript(channel, { header, meta, closeReason, closeFeedback, preserveAttachments = false } = {}) {
    const history = await fetchFullHistory(channel);
    const maxFileBytes = uploadLimitBytes(channel.guild);
    const rendered = renderHistory(history, { preserveAttachments, maxFileBytes });

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

async function downloadAttachment(file) {
    const response = await fetch(file.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

function packBatches(files, limit) {
    const batches = [];
    let current = [];
    let bytes = 0;
    for (const file of files) {
        if (current.length && (current.length >= FILES_PER_MESSAGE || bytes + file.size > limit)) {
            batches.push(current);
            current = [];
            bytes = 0;
        }
        current.push(file);
        bytes += file.size;
    }
    if (current.length) batches.push(current);
    return batches;
}

async function sendTranscript(thread, transcript) {
    const allowedMentions = { parse: [] };

    for (const chunk of transcript.chunks) {
        await thread.send({ content: chunk, allowedMentions });
    }

    const notPreserved = [...transcript.notPreserved];
    const limit = uploadLimitBytes(thread.guild);
    let reposted = 0;

    if (transcript.attachmentGroups.length) {
        try {
            await thread.send({ content: '### 📎 Attachments', allowedMentions });
        } catch (err) {
            console.warn('[ticketTranscript] Could not post attachments header:', err.message);
        }
    }

    for (const group of transcript.attachmentGroups) {
        const batches = packBatches(group.files, limit);

        for (let i = 0; i < batches.length; i++) {
            const label = i === 0 ? group.label : `${group.label} (continued)`;

            const ready = [];
            for (const file of batches[i]) {
                try {
                    ready.push({ file, buffer: await downloadAttachment(file) });
                } catch (err) {
                    console.warn(`[ticketTranscript] Could not download ${file.name}:`, err.message);
                    notPreserved.push(`${file.name} (download failed)`);
                }
            }
            if (!ready.length) continue;

            const toAttachment = ({ file, buffer }) => new AttachmentBuilder(buffer, { name: file.name });

            try {
                await thread.send({ content: label, files: ready.map(toAttachment), allowedMentions });
                reposted += ready.length;
            } catch (err) {
                console.warn('[ticketTranscript] Batch upload failed, retrying individually:', err.message);
                for (const item of ready) {
                    try {
                        await thread.send({ content: label, files: [toAttachment(item)], allowedMentions });
                        reposted += 1;
                    } catch (singleErr) {
                        console.warn(`[ticketTranscript] Could not upload ${item.file.name}:`, singleErr.message);
                        notPreserved.push(`${item.file.name} (upload failed)`);
                    }
                }
            }
        }
    }

    if (notPreserved.length) {
        const list = notPreserved.map(entry => `• ${entry}`).join('\n');
        try {
            await thread.send({ content: `### ⚠️ Not preserved\n${list}`.slice(0, 2000), allowedMentions });
        } catch (err) {
            console.warn('[ticketTranscript] Could not post the not-preserved list:', err.message);
        }
    }

    return { reposted, notPreserved };
}

module.exports = {
    fetchFullHistory,
    chunkLines,
    formatStamp,
    buildTranscript,
    buildTranscriptChunks,
    sendTranscript,
};
