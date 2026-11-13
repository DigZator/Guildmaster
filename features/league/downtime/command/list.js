const { getActiveCharacter, getActiveDowntimeForCharacter } = require('../../../../utils/leagueNotion');
const { getAll: getAllPendingActions } = require('../../../../utils/pendingActions');

// ─── /league downtime list ─────────────────────────────────────────────────────

function extrasNote(p) {
    const quantity = p['Quantity']?.number ?? 1;
    const spellName = p['Spell Name']?.rich_text?.[0]?.plain_text ?? null;
    const itemChoice = p['Item Choice']?.rich_text?.[0]?.plain_text ?? null;
    const parts = [
        quantity > 1 ? `${quantity}×` : null,
        spellName ? `spell: ${spellName}` : null,
        itemChoice ? `item: ${itemChoice}` : null,
    ].filter(Boolean);
    return parts.length ? ` [${parts.join(', ')}]` : '';
}

async function handleDowntimeList(interaction) {
    await interaction.deferReply({ flags: 64 });

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const active = await getActiveDowntimeForCharacter(char.id).catch(() => []);

    const myPending = getAllPendingActions().filter(a => a.target?.discordId === interaction.user.id);
    const pendingStart = myPending.filter(a => a.type === 'downtime-start');
    const pendingCompletion = myPending.filter(a => a.type === 'downtime-completion');

    if (active.length === 0 && pendingCompletion.length === 0 && pendingStart.length === 0) {
        return interaction.editReply({ content: '📋 No active or pending downtime activities.' });
    }

    const sections = [];

    if (active.length > 0) {
        const rows = active.map(a => {
            const p = a.properties;
            const id = p['DTA ID']?.rich_text?.[0]?.plain_text ?? '????';
            const name = p['Activity Name']?.title?.[0]?.plain_text ?? 'Unknown';
            const di = p['Days Invested']?.number ?? 0;
            const dr = p['Days Required']?.number ?? 0;
            return `\`${id}\`  ${name}${extrasNote(p)}  (${di}/${dr} days)`;
        });
        sections.push(`**In Progress**\n${rows.join('\n')}`);
    }

    if (pendingCompletion.length > 0) {
        const rows = pendingCompletion.map(a => {
            const d = a.payload ?? {};
            const extras = [
                d.quantity > 1 ? `${d.quantity}×` : null,
                d.spellName ? `spell: ${d.spellName}` : null,
                d.itemChoice ? `item: ${d.itemChoice}` : null,
            ].filter(Boolean).join(', ');
            return `\`${a.id}\`  ${d.activityName ?? d.dtaId}${extras ? ` (${extras})` : ''}  — ⏳ awaiting admin completion sign-off`;
        });
        sections.push(`**Awaiting Completion Approval**\n${rows.join('\n')}`);
    }

    if (pendingStart.length > 0) {
        const rows = pendingStart.map(r => {
            const d = r.details ?? {};
            const extras = [
                d.tierLabel ? d.tierLabel : null,
                d.quantity > 1 ? `${d.quantity}×` : null,
                d.spellName ? `spell: ${d.spellName}` : null,
                d.itemChoice ? `item: ${d.itemChoice}` : null,
            ].filter(Boolean).join(', ');
            return `\`${r.id}\`  ${d.activityName ?? r.payload?.uid}${extras ? ` (${extras})` : ''}  — ⏳ awaiting admin approval to start`;
        });
        sections.push(`**Awaiting Start Approval**\n${rows.join('\n')}`);
    }

    return interaction.editReply({ content: `📋 **Your Downtime Activities**\n\n${sections.join('\n\n')}` });
}

module.exports = { handleDowntimeList };
