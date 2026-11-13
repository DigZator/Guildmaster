const { sumCosts } = require('../engine');
const { formatCurrency } = require('../../../../utils/currency');

function coerceParam(raw) {
    if (raw == null) return null;
    return raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
}

function formatGpCost(costs, params) {
    const { gpTotal, gpPerDay } = sumCosts(costs ?? [], params ?? {});
    const parts = [];
    if (gpTotal > 0) parts.push(formatCurrency(gpTotal));
    if (gpPerDay > 0) parts.push(`${formatCurrency(gpPerDay)}/day`);
    const hasAssistantCost = (costs ?? []).some(c => c.target === 'assistant');
    return (parts.length ? parts.join(' + ') : 'free') + (hasAssistantCost ? ' (+ assistant pay)' : '');
}

async function postToCharacterThread(client, char, embed) {
    const forumThreadId = char.properties['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
    if (!forumThreadId) return;
    const thread = await client.channels.fetch(forumThreadId).catch(() => null);
    if (thread) await thread.send({ embeds: [embed] });
}

module.exports = { coerceParam, formatGpCost, postToCharacterThread };
