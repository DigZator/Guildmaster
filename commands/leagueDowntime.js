const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getActiveCharacter,
    createDowntimeProgress,
    getDowntimeProgressById,
    getActiveDowntimeForCharacter,
    investDowntimeProgress,
    setDowntimeStatus,
    getCharacterGold,
    adjustCharacterNumbersUnlocked,
    withPageLock,
} = require('../utils/leagueNotion');
const { createStartRequest } = require('../utils/downtimeApprovals');
const { loadBlueprints, resolveCostFromUID, getBlueprint, getBlueprintById, nextDtaId, resolveCost, applyDowntimeOutput, getParamName } = require('../utils/downtime');
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

const CATCH_UP_LEVEL_BRACKETS = [
    { min: 1,  max: 4,  tier: 1 },
    { min: 5,  max: 10, tier: 2 },
    { min: 11, max: 16, tier: 3 },
    { min: 17, max: 20, tier: 4 },
];

function getCatchUpTier(level) {
    return CATCH_UP_LEVEL_BRACKETS.find(b => level >= b.min && level <= b.max)?.tier ?? null;
}

async function handleDowntimeStart(interaction) {
    await interaction.deferReply({ flags: 64 });

    const uid = interaction.options.getString('activity').toUpperCase();
    const resolved = getBlueprintById(uid);
    if (!resolved) return interaction.editReply({ content: `❌ No downtime activity found for UID \`${uid}\`.` });

    const { key, blueprint } = resolved;

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    let cost, effectiveUid = uid;

    if (key === 'catch-up-level') {
        const currentLevel = char.properties['Level']?.number ?? 1;
        const tierNum = getCatchUpTier(currentLevel);
        if (!tierNum) return interaction.editReply({ content: `❌ Could not determine a catch-up tier for level ${currentLevel}.` });
        const tierResolved = getBlueprintById(`00${tierNum}`);
        if (!tierResolved) return interaction.editReply({ content: '❌ Catch-up tier configuration error.' });
        effectiveUid = `00${tierNum}`;
        cost = resolveCostFromUID(effectiveUid);
    } else {
        cost = resolveCostFromUID(uid);
    }

    if (!cost) return interaction.editReply({ content: `❌ Could not resolve a valid cost for UID \`${uid}\`.` });

    if (blueprint.approval?.pre) {
        const reqId = createStartRequest({ uid: effectiveUid, characterPageId: char.id, discordUserId: interaction.user.id });
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
            dtaId, activityId: key, activityName: blueprint.name, characterPageId: char.id,
            activityType: blueprint.category, daysRequired: cost.daysRequired,
            daysInvested: 0, goldRequired: cost.gpTotal, goldInvested: 0, paramValue: cost.tierValue,
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

    let blueprint = activityId ? getBlueprint(activityId) : null;
    if (!blueprint) {
        const blueprints = loadBlueprints();
        const matches = Object.entries(blueprints).filter(([, bp]) => bp.name === activityName);
        if (matches.length > 1) {
            console.warn(`[downtime progress] Ambiguous activity name "${activityName}" matches multiple blueprints: ${matches.map(([id]) => id).join(', ')}`);
        }
        blueprint = matches[0]?.[1] ?? null;
    }

    const newDaysInvested = daysInvested + days;
    const newGoldInvested = (p['Gold Invested']?.number ?? 0) + gpCost;
    const isComplete = newDaysInvested >= daysRequired;
    const needsCompletionApproval = isComplete && blueprint?.approval?.post;

    let currentGold;
    try {
        currentGold = await withPageLock(char.id, async () => {
            const gold = await getCharacterGold(char.id);
            if (gold < gpCost) {
                throw Object.assign(new Error('insufficient-gold'), { code: 'INSUFFICIENT_GOLD', gold });
            }
            await Promise.all([
                adjustCharacterNumbersUnlocked(char.id, { 'Gold': -gpCost, 'Downtime Days': -days }),
                investDowntimeProgress(progress.id, { daysInvested: newDaysInvested, goldInvested: newGoldInvested }),
            ]);
            if (isComplete) await setDowntimeStatus(progress.id, needsCompletionApproval ? 'Pending Completion Approval' : 'Completed');
            return gold;
        });
    } catch (err) {
        if (err.code === 'INSUFFICIENT_GOLD') {
            return interaction.editReply({ content: `❌ Not enough gold. This costs **${formatCurrency(gpCost)}** for ${days} day(s), you have **${formatCurrency(err.gold)}**.` });
        }
        console.error('[downtime progress] Notion error:', err);
        return interaction.editReply({ content: '❌ Failed to log progress. Please try again.' });
    }

    let outputResult = null;
    if (isComplete && !needsCompletionApproval && blueprint?.output) {
        const tierValue = coerceParam(storedParam);
        try {
            outputResult = await applyDowntimeOutput({ output: blueprint.output, characterPageId: char.id, activityName, tierValue }, leagueNotion);
        } catch (err) {
            console.error('[downtime progress] Failed to apply output:', err);
        }
    }
    
    if (outputResult) {
        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(outputResult.needsManualGrant ? 0xe67e22 : 0x2ecc71)
            .setTitle(outputResult.needsManualGrant ? '🎒 Downtime Output — Manual Grant Needed' : '🎁 Downtime Output Applied')
            .addFields(
                { name: 'DTA ID',   value: `\`${dtaId}\``, inline: true },
                { name: 'Activity', value: activityName, inline: true },
                { name: 'Player',   value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Output',   value: outputResult.message, inline: false },
            )
            .setTimestamp()
        );
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
            ...(outputResult ? [{ name: 'Output', value: outputResult.message, inline: false }] : []),
        )
        .setTimestamp();
    
    await postToCharacterThread(interaction.client, char, embed);
    
    return interaction.editReply({
        content: (isComplete
            ? `🎉 **${activityName}** complete!${outputResult ? ` ${outputResult.message}` : ''}`
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
    for (const [key, bp] of entries) {
        (byCategory[bp.category ?? 'Uncategorized'] ??= []).push({ key, bp });
    }

    const sections = Object.keys(byCategory).sort().map(category => {
        const lines = byCategory[category]
            .sort((a, b) => a.bp.name.localeCompare(b.bp.name))
            .flatMap(({ bp }) => {
                const approvalNote = bp.approval?.pre ? ' 🔒pre' : bp.approval?.post ? ' 🔒post' : '';
                if (bp.tiers) {
                    if (bp.name === 'Catch Up (Gain a Level)') {
                        return [`\`${bp.id}\`  **${bp.name}**${approvalNote} — *tier auto-detected from your level*`];
                    }
                    return [
                        `**${bp.name}**${approvalNote}`,
                        ...bp.tiers.map(t => `  \`${t.id}\`  ${t.value ?? (t.min != null || t.max != null ? `${t.min ?? '–'}–${t.max ?? '–'}` : '')}  · ${t.daysRequired}d`),
                    ];
                }
                return [`\`${bp.id}\`  **${bp.name}**${approvalNote} — ${bp.daysRequired}d`];
            });
        return `**__${category}__**\n${lines.join('\n')}`;
    });

    const content = `📋 **Downtime Activities** (use the UID with \`/league downtime start\`)\n\n${sections.join('\n\n')}`;

    if (content.length <= 2000) return interaction.editReply({ content });
    const chunks = [];
    let current = '';
    for (const section of sections) {
        if ((current + '\n\n' + section).length > 1900) { chunks.push(current); current = section; }
        else current = current ? `${current}\n\n${section}` : section;
    }
    if (current) chunks.push(current);
    await interaction.editReply({ content: `📋 **Downtime Activities** (use the UID with \`/league downtime start\`)\n\n${chunks[0]}` });
    for (const chunk of chunks.slice(1)) await interaction.followUp({ content: chunk, flags: 64 });
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
