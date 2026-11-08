const FIELD_VALUE_MAX = 1024;
const TITLE_MAX = 256;
const EMBED_TOTAL_MAX = 6000;
const EMPTY_PLACEHOLDER = '—';

const MEMORIAL_LIMITS = {
    name: 100,
    species: 100,
    class: 100,
    aliases: 200,
    faction: 100,
    backstory: 3000,
    manner: 1500,
    campaign: 100,
    portrait: 1000,
};

function clip(text, max) {
    const str = String(text ?? '');
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function safe(text) {
    return String(text ?? '').trim() || EMPTY_PLACEHOLDER;
}

function chunkText(text, limit = FIELD_VALUE_MAX) {
    let rest = String(text ?? '').trim();
    if (!rest) return [EMPTY_PLACEHOLDER];

    const chunks = [];
    while (rest.length > limit) {
        let cut = rest.lastIndexOf('\n', limit);
        if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
        if (cut < limit * 0.5) cut = limit;
        chunks.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks;
}

function longTextFields(name, text) {
    return chunkText(text).map((value, i) => ({
        name: i === 0 ? name : '\u200B',
        value,
        inline: false,
    }));
}

function embedSize(embed) {
    const d = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
    return (d.title?.length ?? 0)
        + (d.description?.length ?? 0)
        + (d.footer?.text?.length ?? 0)
        + (d.author?.name?.length ?? 0)
        + (d.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
}

module.exports = {
    FIELD_VALUE_MAX,
    TITLE_MAX,
    EMBED_TOTAL_MAX,
    MEMORIAL_LIMITS,
    clip,
    safe,
    chunkText,
    longTextFields,
    embedSize,
};
