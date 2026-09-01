const PREFIX = 'ticket';
const SEPARATOR = ':';

function encodeId(ticketId, action, extra) {
    if (!ticketId || !action) {
        throw new Error('[ticketId] encodeId requires both ticketId and action.');
    }
    const parts = [PREFIX, ticketId, action];
    if (extra !== undefined && extra !== null) {
        parts.push(String(extra));
    }
    const id = parts.join(SEPARATOR);
    if (id.length > 100) {
        throw new Error(`[ticketId] Encoded custom_id exceeds Discord's 100-char limit: "${id}"`);
    }
    return id;
}

function decodeId(customId) {
    const parts = customId.split(SEPARATOR);
    const [prefix, ticketId, action, extra] = parts;
    if (prefix !== PREFIX) {
        throw new Error(`[ticketId] "${customId}" is not a ticket custom_id.`);
    }
    return { ticketId, action, extra };
}

module.exports = { PREFIX, encodeId, decodeId };
