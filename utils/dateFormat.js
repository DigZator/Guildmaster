const IST_OFFSET_MINUTES = 5 * 60 + 30;

const FORMAT_REGEX = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

function formatDateForDisplay(isoString) {
    if (!isoString) return '';

    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';

    const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);

    const yyyy = shifted.getUTCFullYear();
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    const hh = String(shifted.getUTCHours()).padStart(2, '0');
    const min = String(shifted.getUTCMinutes()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}


function parseDateFromInput(raw) {
    const trimmed = (raw || '').trim();

    const match = FORMAT_REGEX.exec(trimmed);
    if (!match) {
        throw new Error(
            `Expected format \`YYYY-MM-DD HH:mm\` (24hr), e.g. \`2026-08-15 21:00\`, but got: \`${raw}\``
        );
    }

    const [, year, month, day, hour, minute] = match;
    const y = Number(year);
    const mo = Number(month);
    const d = Number(day);
    const h = Number(hour);
    const mi = Number(minute);

    if (mo < 1 || mo > 12) throw new Error(`Invalid month in \`${raw}\`. Month must be 01-12.`);
    if (d < 1 || d > 31) throw new Error(`Invalid day in \`${raw}\`. Day must be 01-31.`);
    if (h > 23) throw new Error(`Invalid hour in \`${raw}\`. Hour must be 00-23 (24hr format).`);
    if (mi > 59) throw new Error(`Invalid minute in \`${raw}\`. Minute must be 00-59.`);

    const utcMs = Date.UTC(y, mo - 1, d, h, mi, 0) - IST_OFFSET_MINUTES * 60 * 1000;
    const asDate = new Date(utcMs);

    if (isNaN(asDate.getTime())) {
        throw new Error(`Could not parse \`${raw}\` as a valid date/time.`);
    }

    const check = new Date(asDate.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
    if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== mo - 1 ||
        check.getUTCDate() !== d
    ) {
        throw new Error(`\`${raw}\` is not a real calendar date.`);
    }

    const pad = (n) => String(n).padStart(2, '0');
    return `${year}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00.000+05:30`;
}

function todayISTDateString() {
    const now = new Date();
    const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

module.exports = { formatDateForDisplay, parseDateFromInput, todayISTDateString, IST_OFFSET_MINUTES };
