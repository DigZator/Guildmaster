const DISCORD_CHUNK_LIMIT = 2000;

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

    return messages.reverse(); // oldest first
}

function formatLine(message) {
    const timestamp = new Date(message.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const author = message.author?.tag || message.author?.id || 'Unknown';
    const content = message.content?.length ? message.content : '[no text content]';
    const attachmentNote = message.attachments?.size
        ? ` [${message.attachments.size} attachment(s) not preserved]`
        : '';
    return `[${timestamp}] ${author}: ${content}${attachmentNote}`;
}

function splitOverlongLine(line, limit) {
    const pieces = [];
    for (let i = 0; i < line.length; i += limit) {
        pieces.push(line.slice(i, i + limit));
    }
    return pieces;
}

function chunkLines(lines, limit = DISCORD_CHUNK_LIMIT) {
    const chunks = [];
    let current = '';

    const flush = () => {
        if (current) chunks.push(current);
        current = '';
    };

    for (const line of lines) {
        if (line.length > limit) {
            flush();
            chunks.push(...splitOverlongLine(line, limit));
            continue;
        }

        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > limit) {
            flush();
            current = line;
        } else {
            current = candidate;
        }
    }

    flush();
    return chunks;
}

async function buildTranscriptChunks(channel, { header, closeReason, closeFeedback } = {}) {
    const history = await fetchFullHistory(channel);
    const lines = history.map(formatLine);

    const metaLines = [];
    if (header) metaLines.push(header, '');
    if (closeReason) metaLines.push(`Close reason: ${closeReason}`);
    metaLines.push(`Close feedback: ${closeFeedback?.length ? closeFeedback : 'No feedback provided'}`);
    metaLines.push('', '--- Transcript ---');

    return chunkLines([...metaLines, ...lines]);
}

module.exports = { fetchFullHistory, formatLine, chunkLines, buildTranscriptChunks };
