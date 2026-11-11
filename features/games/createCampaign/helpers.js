const { EMBED_BUDGET, ICON, ERROR_HINTS } = require('./constants');

function slugify(input) {
    return input
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 90);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const yn    = value => (value ? 'Yes' : 'No');

function clip(text, max) {
    const str = String(text ?? '');
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function describeError(err) {
    const code = err?.code;
    const hint = ERROR_HINTS[code];
    const message = err?.message ?? String(err);
    return `${message}${code ? ` [${code}]` : ''}${hint ? ` — ${hint}` : ''}`;
}

function formatLog(entries) {
    return entries
        .map(e => `${ICON[e.status] ?? '•'} ${e.label}${e.detail ? ` — ${clip(e.detail, 220)}` : ''}`)
        .join('\n');
}

function embedSize(embed) {
    const d = embed.data ?? {};
    return (d.title?.length ?? 0)
        + (d.description?.length ?? 0)
        + (d.footer?.text?.length ?? 0)
        + (d.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
}

// Groups embeds into messages that stay under Discord's combined-size and count limits.
function chunkEmbeds(embeds) {
    const chunks = [];
    let current = [];
    let size = 0;
    for (const embed of embeds) {
        const s = embedSize(embed);
        if (current.length && (size + s > EMBED_BUDGET || current.length >= 10)) {
            chunks.push(current);
            current = [];
            size = 0;
        }
        current.push(embed);
        size += s;
    }
    if (current.length) chunks.push(current);
    return chunks;
}

module.exports = {
    slugify,
    sleep,
    yn,
    clip,
    describeError,
    formatLog,
    chunkEmbeds,
};
