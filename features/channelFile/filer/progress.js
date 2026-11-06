const { MAX_SNAGS, PROGRESS_INTERVAL_MS } = require('./constants');

// ─── Snags ──────────────────────────────────────────────────────────────────
function createSnagList(existing = []) {
    const list = [...existing];
    let overflow = 0;
    return {
        list,
        get overflow() { return overflow; },
        add(kind, message, extra = {}) {
            if (list.length >= MAX_SNAGS) { overflow++; return; }
            list.push({ kind, message, ...extra });
        },
    };
}

// ─── Progress ───────────────────────────────────────────────────────────────
function createProgress(message, title) {
    let last = 0;
    return {
        async set(text, { force = false } = {}) {
            if (!message) return;
            const now = Date.now();
            if (!force && now - last < PROGRESS_INTERVAL_MS) return;
            last = now;
            await message.edit({ content: `⏳ **${title}**\n${text}`.slice(0, 2000), embeds: [], components: [] }).catch(() => {});
        },
    };
}

module.exports = {
    createSnagList,
    createProgress,
};
