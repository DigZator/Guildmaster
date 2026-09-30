const PREFIX = 'dl';
const SEPARATOR = ':';

function encodeId(dlId, action, extra) {
    if (!dlId || !action) {
        throw new Error('[directLineId] encodeId requires both dlId and action.');
    }
    const parts = [PREFIX, dlId, action];
    if (extra !== undefined && extra !== null) {
        parts.push(String(extra));
    }
    const id = parts.join(SEPARATOR);
    if (id.length > 100) {
        throw new Error(`[directLineId] Encoded custom_id exceeds Discord's 100-char limit: "${id}"`);
    }
    return id;
}

function decodeId(customId) {
    const parts = customId.split(SEPARATOR);
    const [prefix, dlId, action, extra] = parts;
    if (prefix !== PREFIX) {
        throw new Error(`[directLineId] "${customId}" is not a direct_line custom_id.`);
    }
    return { dlId, action, extra };
}

module.exports = { PREFIX, encodeId, decodeId };
