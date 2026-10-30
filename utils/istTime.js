const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = n => String(n).padStart(2, '0');
const shifted = ms => new Date(ms + IST_OFFSET_MS);

function istDateStr(ms = Date.now()) {
    const d = shifted(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Minutes since IST midnight.
function istMinutesOfDay(ms = Date.now()) {
    const d = shifted(ms);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// 'HH:MM' → minutes since midnight
function parseTimeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function istDayStartMs(ms = Date.now()) {
    return Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

function istTimeOnDayMs(timeStr, ms = Date.now()) {
    return istDayStartMs(ms) + parseTimeToMinutes(timeStr) * 60 * 1000;
}

function toDiscordTimestamp(timeStr, ms = Date.now()) {
    return Math.floor(istTimeOnDayMs(timeStr, ms) / 1000);
}

function crossedDailyTime(timeStr, lastMs, nowMs) {
    if (nowMs <= lastMs) return false;
    for (let day = istDayStartMs(lastMs); day <= nowMs; day += DAY_MS) {
        const target = day + parseTimeToMinutes(timeStr) * 60 * 1000;
        if (target > lastMs && target <= nowMs) return true;
    }
    return false;
}

module.exports = {
    istDateStr,
    istMinutesOfDay,
    parseTimeToMinutes,
    istTimeOnDayMs,
    toDiscordTimestamp,
    crossedDailyTime,
};
