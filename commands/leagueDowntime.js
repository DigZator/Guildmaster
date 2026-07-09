const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getActiveCharacter,
    createDowntimeProgress,
    getDowntimeProgressById,
    getActiveDowntimeForCharacter,
    investDowntimeProgress,
    setDowntimeStatus,
    getCharacterGold,
    setCharacterGold,
    adjustCharacterNumber,
} = require('../utils/leagueNotion');
const { createStartRequest } = require('../utils/downtimeApprovals');
const { loadBlueprints, getBlueprint, nextDtaId, resolveCost, applyDowntimeOutput, getParamName } = require('../utils/downtime');
const leagueNotion = require('../utils/leagueNotion');
const { formatCurrency } = require('../utils/currency');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

function coerceParam(raw) {
    if (raw == null) return null;
    return raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
}

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
    const paramValue  = coerceParam(interaction.options.getString('param'));

    const blueprint = getBlueprint(activityId);
    if (!blueprint) return interaction.editReply({ content: `❌ No downtime activity found for \`${activityId}\`.` });

    const paramName = getParamName(blueprint);
    if (paramName && paramValue == null) {
        return interaction.editReply({ content: `❌ **${blueprint.name}** requires a \`param\` value (${paramName}).` });
    }

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const cost = resolveCost(blueprint, { [paramName]: paramValue });
    if (!cost) return interaction.editReply({ content: `❌ Could not resolve a valid cost tier for this activity${paramName ? ` — check your \`${paramName}\` value` : ''}.` });

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
            dtaId, activityId, activityName: blueprint.name, characterPageId: char.id,
            activityType: blueprint.category, daysRequired: cost.daysRequired,
            daysInvested: 0, goldRequired: cost.gpTotal, goldInvested: 0, paramValue,
        });
    } catch (err) {
        console.error('[downtime start] Notion error:', err);
        return interaction.editReply({ content: '❌ Failed to start activity. Please try again.' });
    }

    const checksNote = blueprint.checks
        ? `\n🎲 Requires ${blueprint.checks.successesRequired}/${blueprint.checks.attempts} successful ${blueprint.checks.skill} checks (DC ${blueprint.checks.dc}) — tracked by your GM, not the bot.`
        : '';

    return interaction.editReply({
        content: `✅ Started **${blueprint.name}** — DTA ID \`${dtaId}\`. Requires ${cost.daysRequired} day(s)${cost.gpTotal != null ? ` and ${formatCurrency(cost.gpTotal)}` : ''}.${checksNote}\nUse \`/league downtime progress\` to invest days.`,
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
    const activityId    = p['Activity ID']?.rich_text?.[0]?.plain_text ?? null;
    const storedParam   = p['Param Value']?.rich_text?.[0]?.plain_text ?? null;

    const remainingDays = daysRequired - daysInvested;
    if (days > remainingDays) return interaction.editReply({ content: `❌ Only ${remainingDays} day(s) remain on this activity.` });

    const currentDowntimeDays = char.properties['Downtime Days']?.number ?? 0;
    if (currentDowntimeDays < days) {
        return interaction.editReply({ content: `❌ Not enough downtime days. This costs **${days}** day(s), you have **${currentDowntimeDays}** banked.` });
    }

    const gpPerDay = goldRequired != null ? goldRequired / daysRequired : 0;
    const gpCost = Math.round(gpPerDay * days * 100) / 100;

    const currentGold = await getCharacterGold(char.id).catch(() => 0);
    if (currentGold < gpCost) {
        return interaction.editReply({ content: `❌ Not enough gold. This costs **${formatCurrency(gpCost)}** for ${days} day(s), you have **${formatCurrency(currentGold)}**.` });
    }

    const newDaysInvested = daysInvested + days;
    const newGoldInvested = (p['Gold Invested']?.number ?? 0) + gpCost;
    const isComplete = newDaysInvested >= daysRequired;

    let blueprint = activityId ? getBlueprint(activityId) : null;
    if (!blueprint) {
        const blueprints = loadBlueprints();
        const matches = Object.entries(blueprints).filter(([, bp]) => bp.name === activityName);
        if (matches.length > 1) {
            console.warn(`[downtime progress] Ambiguous activity name "${activityName}" matches multiple blueprints: ${matches.map(([id]) => id).join(', ')}`);
        }
        blueprint = matches[0]?.[1] ?? null;
    }
    const needsCompletionApproval = isComplete && blueprint?.approval?.post;

    try {
        await Promise.all([
            setCharacterGold(char.id, currentGold - gpCost),
            adjustCharacterNumber(char.id, 'Downtime Days', -days),
            investDowntimeProgress(progress.id, { daysInvested: newDaysInvested, goldInvested: newGoldInvested }),
        ]);
        if (isComplete) await setDowntimeStatus(progress.id, needsCompletionApproval ? 'Pending Completion Approval' : 'Completed');
    } catch (err) {
        console.error('[downtime progress] Notion error:', err);
        return interaction.editReply({ content: '❌ Failed to log progress. Please try again.' });
    }

    let outputMsg = null;
    if (isComplete && !needsCompletionApproval && blueprint?.output) {
        const tierValue = blueprint.costModel === 'parameterized'
            ? resolveCost(blueprint, { [getParamName(blueprint)]: coerceParam(storedParam) })?.tierValue
            : null;
        try {
            outputMsg = await applyDowntimeOutput({
                output: blueprint.output, characterPageId: char.id, activityName, tierValue,
            }, leagueNotion);
        } catch (err) {
            console.error('[downtime progress] Failed to apply output:', err);
        }
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
            ...(outputMsg ? [{ name: 'Output', value: outputMsg, inline: false }] : []),
        )
        .setTimestamp();

    await postToCharacterThread(interaction.client, char, embed);

    return interaction.editReply({
        content: (isComplete
            ? `🎉 **${activityName}** complete!${outputMsg ? ` ${outputMsg}.` : ''}`
            : `✅ Logged ${days} day(s) on **${activityName}** (${newDaysInvested}/${daysRequired}). Spent ${formatCurrency(gpCost)}.`)
            + ` (${currentDowntimeDays - days} downtime day(s) remaining)`,
    });
}

// ─── /league downtime buy-days ─────────────────────────────────────────────────

const REP_COST_PER_TOPUP = 1;
const DAYS_PER_TOPUP = 10;

async function handleDowntimeBuyDays(interaction) {
    await interaction.deferReply({ flags: 64 });

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const currentRep = char.properties['Reputation Points']?.number ?? 0;
    const currentDowntimeDays = char.properties['Downtime Days']?.number ?? 0;

    if (currentRep < REP_COST_PER_TOPUP) {
        return interaction.editReply({ content: `❌ You need **${REP_COST_PER_TOPUP} reputation point** to do this, you have **${currentRep}**.` });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dtbuy_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dtbuy_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
        content: `Spend **${REP_COST_PER_TOPUP} reputation point** for **+${DAYS_PER_TOPUP} downtime days**?\n` +
            `Current: ${currentRep} RP, ${currentDowntimeDays} downtime day(s).\n` +
            `After: ${currentRep - REP_COST_PER_TOPUP} RP, ${currentDowntimeDays + DAYS_PER_TOPUP} downtime day(s).`,
        components: [row],
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

// ─── /league downtime activities ───────────────────────────────────────────────

async function handleDowntimeActivities(interaction) {
    await interaction.deferReply({ flags: 64 });

    const blueprints = loadBlueprints();
    const entries = Object.entries(blueprints);
    if (entries.length === 0) return interaction.editReply({ content: '📋 No downtime activities configured.' });

    const byCategory = {};
    for (const [id, bp] of entries) {
        const category = bp.category ?? 'Uncategorized';
        (byCategory[category] ??= []).push({ id, bp });
    }

    const sections = Object.keys(byCategory).sort().map(category => {
        const lines = byCategory[category]
            .sort((a, b) => a.bp.name.localeCompare(b.bp.name))
            .map(({ id, bp }) => {
                const paramName = getParamName(bp);
                const approvalNote = bp.approval?.pre ? ' 🔒pre' : bp.approval?.post ? ' 🔒post' : '';
                return `\`${id}\`  ${bp.name}${paramName ? ` *(param: ${paramName})*` : ''}${approvalNote}`;
            });
        return `**${category}**\n${lines.join('\n')}`;
    });

    const content = `📋 **Downtime Activities** (use the \`activity\` ID with \`/league downtime start\`)\n\n${sections.join('\n\n')}`;

    // Discord message content limit is 2000 chars; split if needed.
    if (content.length <= 2000) {
        return interaction.editReply({ content });
    }
    const chunks = [];
    let current = '';
    for (const section of sections) {
        if ((current + '\n\n' + section).length > 1900) {
            chunks.push(current);
            current = section;
        } else {
            current = current ? `${current}\n\n${section}` : section;
        }
    }
    if (current) chunks.push(current);

    await interaction.editReply({ content: `📋 **Downtime Activities** (use the \`activity\` ID with \`/league downtime start\`)\n\n${chunks[0]}` });
    for (const chunk of chunks.slice(1)) {
        await interaction.followUp({ content: chunk, flags: 64 });
    }
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function leagueDowntime(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'start':      return handleDowntimeStart(interaction);
        case 'progress':   return handleDowntimeProgress(interaction);
        case 'list':       return handleDowntimeList(interaction);
        case 'buy-days':   return handleDowntimeBuyDays(interaction);
        case 'activities': return handleDowntimeActivities(interaction);
    }
}

module.exports = { leagueDowntime, REP_COST_PER_TOPUP, DAYS_PER_TOPUP };
