// Cutting transcript lines into messages that fit Discord's limit.

const DISCORD_CHUNK_LIMIT = 2000;

const CHUNK_SIZE = DISCORD_CHUNK_LIMIT - 10;

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

module.exports = { buildHeaderLines, chunkLines };
