const path = require('path');
const { formatDate, formatTime, formatStamp, dayKey, formatSize } = require('./format');

// Reading a channel's history and rendering it as transcript lines.

const GROUP_GAP_MS = 5 * 60 * 1000;

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

module.exports = { fetchFullHistory, renderHistory };
