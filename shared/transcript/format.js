const { MB } = require('./limits');

// Dates (IST) and sizes as the transcript prints them.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

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

module.exports = { formatDate, formatTime, formatStamp, dayKey, formatSize };
