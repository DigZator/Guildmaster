const PREFIX = 'questDash';
const SEPARATOR = ':';

function encodeId(questId, action, extra) {
    if (!questId || !action) {
        throw new Error('[questDashboardId] encodeId requires both questId and action.');
    }
    const parts = [PREFIX, questId, action];
    if (extra !== undefined && extra !== null) {
        parts.push(String(extra));
    }
    const id = parts.join(SEPARATOR);
    if (id.length > 100) {
        throw new Error(`[questDashboardId] Encoded custom_id exceeds Discord's 100-char limit: "${id}"`);
    }
    return id;
}

function decodeId(customId) {
    const parts = customId.split(SEPARATOR);
    const [prefix, questId, action, extra] = parts;
    if (prefix !== PREFIX) {
        throw new Error(`[questDashboardId] "${customId}" is not a dashboard custom_id.`);
    }
    return { questId, action, extra };
}

module.exports = {
    PREFIX,
    encodeId,
    decodeId,
};
