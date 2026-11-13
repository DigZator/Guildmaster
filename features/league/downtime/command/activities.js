const { loadBlueprints, getParamName } = require('../engine');
const { formatGpCost } = require('./helpers');

// ─── /league downtime activities ───────────────────────────────────────────────

async function handleDowntimeActivities(interaction) {
    await interaction.deferReply({ flags: 64 });

    const blueprints = loadBlueprints();
    const entries = Object.entries(blueprints);
    if (entries.length === 0) return interaction.editReply({ content: '📋 No downtime activities configured.' });

    const byCategory = {};
    for (const [key, bp] of entries) {
        (byCategory[bp.category ?? 'Uncategorized'] ??= []).push({ key, bp });
    }

    const sections = Object.keys(byCategory).sort().map(category => {
        const lines = byCategory[category]
            .sort((a, b) => a.bp.name.localeCompare(b.bp.name))
            .flatMap(({ bp }) => {
                const approvalNote = bp.approval?.pre ? ' 🔒pre' : bp.approval?.post ? ' 🔒post' : '';
                if (bp.tiers) {
                    if (bp.name === 'Catch Up (Gain a Milestone)') {
                        return [
                            `**${bp.name}**${approvalNote} — *tier auto-detected from your level*`,
                            ...bp.tiers.map(t => `  \`${t.id}\`  Tier ${t.value}  · ${t.daysRequired}d · ${formatGpCost(t.costs, {})}`),
                        ];
                    }
                    return [
                        `**${bp.name}**${approvalNote}`,
                        ...bp.tiers.map(t => {
                            const pName = getParamName(bp);
                            return `  \`${t.id}\`  ${t.value ?? (t.min != null || t.max != null ? `${t.min ?? '–'}–${t.max ?? '–'}` : '')}  · ${t.daysRequired}d · ${formatGpCost(t.costs, pName ? { [pName]: t.value } : {})}`;
                        }),
                    ];
                }
                return [`\`${bp.id}\`  **${bp.name}**${approvalNote} — ${bp.daysRequired}d · ${formatGpCost(bp.costs, {})}`];
            });
        return `**__${category}__**\n${lines.join('\n')}`;
    });

    const content = `📋 **Downtime Activities** (reference only — use \`/league downtime start\` and pick from the autocomplete)\n\n${sections.join('\n\n')}`;

    if (content.length <= 2000) return interaction.editReply({ content });
    const chunks = [];
    let current = '';
    for (const section of sections) {
        if ((current + '\n\n' + section).length > 1900) { chunks.push(current); current = section; }
        else current = current ? `${current}\n\n${section}` : section;
    }
    if (current) chunks.push(current);
    await interaction.editReply({ content: `📋 **Downtime Activities** (reference only — use \`/league downtime start\` and pick from the autocomplete)\n\n${chunks[0]}` });
    for (const chunk of chunks.slice(1)) await interaction.followUp({ content: chunk, flags: 64 });
}

module.exports = { handleDowntimeActivities };
