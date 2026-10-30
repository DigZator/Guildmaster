const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../../utils/isAdminChannel');
const { getAll } = require('../../../utils/pendingActions');

// ─── /leagueadmin pending ─────────────────────────────────────────────────────
async function handlePending(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const actions = getAll().filter(a => a.status === 'pending' || a.status === 'partially_failed');

    if (actions.length === 0) {
        return interaction.editReply({ content: '✅ No pending actions.' });
    }

    const GRANT_TYPES = new Set(['reputation', 'gold', 'milestone']);
    const QUEST_TYPES = new Set(['quest-link', 'quest-complete', 'quest-cancel', 'quest-report']);
    const DOWNTIME_START_TYPES = new Set(['downtime-start']);
    const DOWNTIME_COMPLETION_TYPES = new Set(['downtime-completion']);

    const grantLines = [];
    const itemLines = [];
    const questLines = [];
    const downtimeStartLines = [];
    const downtimeCompletionLines = [];

    for (const a of actions) {
        const timestamp = `<t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:R>`;
        let line;

        if (a.type === 'quest-report') {
            const allLines = a.payload?.lines ?? [];
            const characterCount = new Set(allLines.map(l => l.characterPageId)).size;
            const rejectedCount = allLines.filter(l => l.lineStatus === 'rejected').length;
            const failedCount = allLines.filter(l => l.applyStatus === 'failed').length;
            const notes = [
                a.status === 'partially_failed' ? '⚠️ partially failed' : null,
                rejectedCount > 0 ? `${rejectedCount} admin-rejected` : null,
                failedCount > 0 ? `${failedCount} failed` : null,
            ].filter(Boolean).join(', ');
            const label = `${allLines.length} line item(s) across ${characterCount} character(s)${notes ? ` (${notes})` : ''} — ${a.quest?.questName ?? a.quest?.questId ?? 'Unknown quest'}`;
            line = `\`${a.id}\` — ${label} | Requested by <@${a.dm.discordId}> | ${timestamp}`;
        } else if (a.type === 'downtime-start') {
            const d = a.details ?? {};
            const extras = [
                d.tierLabel ? d.tierLabel : null,
                d.quantity > 1 ? `${d.quantity}×` : null,
                d.spellName ? `spell: ${d.spellName}` : null,
                d.itemChoice ? `item: ${d.itemChoice}` : null,
            ].filter(Boolean).join(', ');
            const label = `${d.activityName ?? a.payload?.uid}${extras ? ` (${extras})` : ''} — ${d.characterName ?? 'Unknown character'}`;
            line = `\`${a.id}\` — ${label} | Requested by <@${a.dm.discordId}> | ${timestamp}`;
        } else if (a.type === 'downtime-completion') {
            const d = a.payload ?? {};
            const extras = [
                d.quantity > 1 ? `${d.quantity}×` : null,
                d.spellName ? `spell: ${d.spellName}` : null,
                d.itemChoice ? `item: ${d.itemChoice}` : null,
            ].filter(Boolean).join(', ');
            const label = `${d.activityName ?? d.dtaId}${extras ? ` (${extras})` : ''} — ${a.target?.characterName ?? 'Unknown character'} (DTA \`${d.dtaId}\`)`;
            line = `\`${a.id}\` — ${label} | Player <@${a.dm.discordId}> | ${timestamp}`;
        } else {
            const label = a.target?.characterName
                ? `${a.target.characterName} (+${a.payload?.amount})`
                : a.quest?.questName ?? 'Unknown';
            line = `\`${a.id}\` — **${a.type}** | ${label} | Requested by <@${a.dm.discordId}> | ${timestamp}`;
        }

        if (GRANT_TYPES.has(a.type)) grantLines.push(line);
        else if (a.type === 'item') itemLines.push(line);
        else if (QUEST_TYPES.has(a.type)) questLines.push(line);
        else if (DOWNTIME_START_TYPES.has(a.type)) downtimeStartLines.push(line);
        else if (DOWNTIME_COMPLETION_TYPES.has(a.type)) downtimeCompletionLines.push(line);
        else grantLines.push(line);
    }

    // chunk any section that overflows.
    function chunkedFields(sectionName, sectionLines) {
        if (sectionLines.length === 0) return [];
        const fields = [];
        let buf = '';
        let part = 1;
        for (const line of sectionLines) {
            if ((buf + '\n' + line).length > 1000) {
                fields.push({ name: part === 1 ? sectionName : `${sectionName} (cont.)`, value: buf.trim() });
                buf = '';
                part++;
            }
            buf += line + '\n';
        }
        if (buf.trim()) fields.push({ name: part === 1 ? sectionName : `${sectionName} (cont.)`, value: buf.trim() });
        return fields;
    }

    const fields = [
        ...chunkedFields(`💰 Currency & Milestone Grants (${grantLines.length})`, grantLines),
        ...chunkedFields(`🎒 Item Grants (${itemLines.length})`, itemLines),
        ...chunkedFields(`📜 Quest Actions (${questLines.length})`, questLines),
        ...chunkedFields(`🛠️ Downtime — Start Approval (${downtimeStartLines.length})`, downtimeStartLines),
        ...chunkedFields(`⏳ Downtime — Completion Approval (${downtimeCompletionLines.length})`, downtimeCompletionLines),
    ].slice(0, 25);

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('⏳ Pending Actions')
        .addFields(fields)
        .setFooter({ text: 'Approve/reject grants & quests with /leagueadmin approve|reject. Approve downtime with /leagueadmin downtime approve.' })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

module.exports = {
    handlePending,
};
