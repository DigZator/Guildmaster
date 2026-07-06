const { EmbedBuilder } = require('discord.js');
const {
    getActiveCharacter,
    getPageById,
    createDowntimeProgress,
    getDowntimeProgressById,
    getActiveDowntimeForCharacter,
    investDowntimeProgress,
    setDowntimeStatus,
    getCharacterGold,
    setCharacterGold,
    createInventoryItem,
} = require('../utils/leagueNotion');
const { createStartRequest } = require('../utils/downtimeApprovals');
const { loadBlueprints, getBlueprint, nextDtaId, resolveCost } = require('../utils/downtime');
const { formatCurrency } = require('../utils/currency');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

async function sendAdminLog(guild, embed) {
    const channel = guild.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
    if (channel) await channel.send({ embeds: [embed] });
}

async function postToCharacterThread(client, char, embed) {
    const forumThreadId = char.properties['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
    if (!forumThreadId) return;
    const thread = await client.channels.fetch(forumThreadId).catch(() => null);
    if (thread) await thread.send({ embeds: [embed] });
}

// ─── /league downtime start ────────────────────────────────────────────────────

async function handleDowntimeStart(interaction) {
    await interaction.deferReply({ flags: 64 });

    const activityId = interaction.options.getString('activity');
    const paramValue  = interaction.options.getInteger('param');

    const blueprint = getBlueprint(activityId);
    if (!blueprint) return interaction.editReply({ content: `❌ No downtime activity found for \`${activityId}\`.` });

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const cost = resolveCost(blueprint, { [blueprint.paramName]: paramValue });
    if (!cost) return interaction.editReply({ content: `❌ Could not resolve a valid cost tier for this activity${blueprint.paramName ? ` — check your \`${blueprint.paramName}\` value` : ''}.` });

    if (blueprint.approval?.pre) {
        const reqId = createStartRequest({ activityId, characterPageId: char.id, discordUserId: interaction.user.id, paramValue });
        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle('⏳ Downtime Start Approval Requested')
            .addFields(
                { name: 'Request ID', value: `\`${reqId}\``, inline: true },
                { name: 'Activity',   value: blueprint.name, inline: true },
                { name: 'Player',     value: `<@${interaction.user.id}>`, inline: true },
            )
            .setDescription(blueprint.prerequisites?.length ? `**Self-attested prerequisites:** ${blueprint.prerequisites.map(p => p.description).join('; ')}` : null)
            .setTimestamp()
        );
        return interaction.editReply({ content: `⏳ **${blueprint.name}** requires admin approval to begin. Request \`${reqId}\` submitted.` });
    }

    const dtaId = nextDtaId();
    try {
        await createDowntimeProgress({
            dtaId, activityName: blueprint.name, characterPageId: char.id,
            activityType: blueprint.category, daysRequired: cost.daysRequired,
            daysInvested: 0, goldRequired: cost.gpTotal, goldInvested: 0,
        });
    } catch (err) {
        console.error('[downtime start] Notion error:', err);
        return interaction.editReply({ content: '❌ Failed to start activity. Please try again.' });
    }

    return interaction.editReply({
        content: `✅ Started **${blueprint.name}** — DTA ID \`${dtaId}\`. Requires ${cost.daysRequired} day(s)${cost.gpTotal != null ? ` and ${formatCurrency(cost.gpTotal)}` : ''}.\nUse \`/league downtime progress\` to invest days.`,
    });
}

// ─── /league downtime progress ─────────────────────────────────────────────────

async function handleDowntimeProgress(interaction) {
    await interaction.deferReply({ flags: 64 });

    const dtaId = interaction.options.getString('id').toUpperCase();
    const days  = interaction.options.getInteger('days');

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const progress = await getDowntimeProgressById(dtaId).catch(() => null);
    if (!progress) return interaction.editReply({ content: `❌ No downtime activity found with ID \`${dtaId}\`.` });

    const p = progress.properties;
    const status = p['Status']?.select?.name;
    if (status !== 'In Progress') return interaction.editReply({ content: `❌ This activity is not in progress (status: ${status}).` });

    const daysRequired  = p['Days Required']?.number ?? 0;
    const daysInvested  = p['Days Invested']?.number ?? 0;
    const goldRequired  = p['Gold Required']?.number ?? null;
    const activityName  = p['Activity Name']?.title?.[0]?.plain_text ?? 'Unknown';

    const remainingDays = daysRequired - daysInvested;
    if (days > remainingDays) return interaction.editReply({ content: `❌ Only ${remainingDays} day(s) remain on this activity.` });

    // gp cost is spread evenly across required days when a flat/parameterized total exists
    const gpPerDay = goldRequired != null ? goldRequired / daysRequired : 0;
    const gpCost = Math.round(gpPerDay * days * 100) / 100;

    const currentGold = await getCharacterGold(char.id).catch(() => 0);
    if (currentGold < gpCost) {
        return interaction.editReply({ content: `❌ Not enough gold. This costs **${formatCurrency(gpCost)}** for ${days} day(s), you have **${formatCurrency(currentGold)}**.` });
    }

    const newDaysInvested = daysInvested + days;
    const newGoldInvested = (p['Gold Invested']?.number ?? 0) + gpCost;
    const isComplete = newDaysInvested >= daysRequired;

    const blueprints = loadBlueprints();
    const matches = Object.entries(blueprints).filter(([, bp]) => bp.name === activityName);
    if (matches.length > 1) {
        console.warn(`[downtime progress] Ambiguous activity name "${activityName}" matches multiple blueprints: ${matches.map(([id]) => id).join(', ')}`);
    }
    const blueprint = matches[0]?.[1] ?? null;
    const needsCompletionApproval = isComplete && blueprint?.approval?.post;

    try {
        await Promise.all([
            setCharacterGold(char.id, currentGold - gpCost),
            investDowntimeProgress(progress.id, { daysInvested: newDaysInvested, goldInvested: newGoldInvested }),
        ]);
        if (isComplete) await setDowntimeStatus(progress.id, needsCompletionApproval ? 'Pending Completion Approval' : 'Completed');
    } catch (err) {
        console.error('[downtime progress] Notion error:', err);
        return interaction.editReply({ content: '❌ Failed to log progress. Please try again.' });
    }
    
    if (needsCompletionApproval) {
        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle('⏳ Downtime Completion Approval Needed')
            .addFields(
                { name: 'DTA ID',   value: `\`${dtaId}\``, inline: true },
                { name: 'Activity', value: activityName, inline: true },
                { name: 'Player',   value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp()
        );
    }

    const embed = new EmbedBuilder()
        .setColor(needsCompletionApproval ? 0xe67e22 : isComplete ? 0x2ecc71 : 0xf1c40f)
        .setTitle(needsCompletionApproval ? `⏳ Awaiting Completion Approval: ${activityName}` : isComplete ? `✅ Downtime Complete: ${activityName}` : `⏳ Downtime Progress: ${activityName}`)
        .addFields(
            { name: 'DTA ID', value: `\`${dtaId}\``, inline: true },
            { name: 'Days',   value: `${newDaysInvested} / ${daysRequired}`, inline: true },
            { name: 'Spent',  value: formatCurrency(gpCost), inline: true },
        )
        .setTimestamp();

    await postToCharacterThread(interaction.client, char, embed);

    return interaction.editReply({
        content: isComplete
            ? `🎉 **${activityName}** complete!`
            : `✅ Logged ${days} day(s) on **${activityName}** (${newDaysInvested}/${daysRequired}). Spent ${formatCurrency(gpCost)}.`,
    });
}

// ─── /league downtime list ─────────────────────────────────────────────────────

async function handleDowntimeList(interaction) {
    await interaction.deferReply({ flags: 64 });

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const active = await getActiveDowntimeForCharacter(char.id).catch(() => []);
    if (active.length === 0) return interaction.editReply({ content: '📋 No active downtime activities.' });

    const rows = active.map(a => {
        const p = a.properties;
        const id = p['DTA ID']?.rich_text?.[0]?.plain_text ?? '????';
        const name = p['Activity Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const di = p['Days Invested']?.number ?? 0;
        const dr = p['Days Required']?.number ?? 0;
        return `\`${id}\`  ${name}  (${di}/${dr} days)`;
    });

    return interaction.editReply({ content: `📋 **Active Downtime Activities**\n${rows.join('\n')}` });
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function leagueDowntime(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'start':    return handleDowntimeStart(interaction);
        case 'progress': return handleDowntimeProgress(interaction);
        case 'list':     return handleDowntimeList(interaction);
    }
}

module.exports = { leagueDowntime };
