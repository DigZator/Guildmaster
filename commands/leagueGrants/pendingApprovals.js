const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../utils/isAdminChannel');
const { getActiveCharacter, adjustCharacterNumber, createInventoryItem, setDowntimeStatus, createDowntimeProgress } = require('../../utils/leagueNotion');
const leagueNotion = require('../../utils/leagueNotion');
const { applyMilestones } = require('../../utils/milestones');
const { getAll, getById, removeById, updateById } = require('../../utils/pendingActions');
const { rejectReportLine, applyReportLines } = require('../../utils/questReportAppliers');
const { buildByCharacterEmbed } = require('../../utils/questReportEmbed');
const questDrafts = require('../../utils/questDrafts');
const { renderMainView, loadDashboardState } = require('../../interactions/questDashboardRender');
const { attachDashboardExpiry } = require('../../utils/dashboardExpiry');
const { approveQuestLink, approveQuestComplete, approveQuestCancel } = require('../leagueQuest');
const { getBlueprint, nextDtaId, getBlueprintById, resolveCostFromUID, applyDowntimeOutput } = require('../../utils/downtime');
const { sendAdminLog } = require('../../utils/adminLog');
const { DM_ROLE_ID } = require('./shared');

async function handleDashboard(interaction) {
    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply();

    const questId = interaction.options.getString('quest_id');

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
    } catch (err) {
        if (err.message?.startsWith('❌')) {
            return interaction.editReply({ content: err.message });
        }
        console.error('[leaguedm dashboard] Error loading dashboard state:', err);
        return interaction.editReply({ content: '❌ Could not load the dashboard. Please try again.' });
    }

    const payload = renderMainView(state.draft, state.roster, { grouping: 'character', quest: state.quest });
    const message = await interaction.editReply(payload);
    attachDashboardExpiry(message, state.questId);
    return message;
}

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

// ─── /leagueadmin approve ─────────────────────────────────────────────────────
async function handleApprove(interaction, client) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    const ids = interaction.options.getString('id').split(',').map(s => s.trim()).filter(Boolean);
    await interaction.deferReply({ flags: 64 });

    const results = [];

    for (const id of ids) {
        const entry = getById(id);
        if (!entry) {
            results.push(`❌ \`${id}\` — not found.`);
            continue;
        }

        try {
            if (entry.type === 'reputation') {
	            await adjustCharacterNumber(entry.target.characterPageId, 'Reputation Points', entry.payload.amount);
	            removeById(id);
	            try {
	                await sendAdminLog(interaction.guild, new EmbedBuilder()
	                    .setColor(0x57f287)
	                    .setTitle('✅ Reputation Grant Approved')
	                    .addFields(
	                        { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
	                        { name: 'Character',    value: entry.target.characterName,     inline: true },
	                        { name: 'Player',       value: `<@${entry.target.discordId}>`, inline: true },
	                        { name: 'Approved By',  value: `<@${interaction.user.id}>`,    inline: true },
	                        { name: 'Requested By', value: `<@${entry.dm.discordId}>`,     inline: true },
	                        { name: 'Amount',       value: `+${entry.payload.amount}`,     inline: true },
	                        { name: 'Action ID',    value: `\`${entry.id}\``,             inline: false },
	                    )
	                    .setTimestamp()
	                );
	            } catch (logErr) {
	                console.warn(`[leagueadmin approve] Reputation applied for ${id} but admin log failed:`, logErr.message);
	            }
	            results.push(`✅ \`${id}\` — **${entry.target.characterName}** (reputation) approved.`);
	            continue;
	        }

            if (entry.type === 'gold') {
	            await adjustCharacterNumber(entry.target.characterPageId, 'Gold', entry.payload.amount);
	            if (entry.quest?.questPageId) {
	                await adjustCharacterNumber(entry.quest.questPageId, 'Gold Awarded', entry.payload.amount);
	            }
	            removeById(id);
	            try {
	                await sendAdminLog(interaction.guild, new EmbedBuilder()
	                    .setColor(0x57f287)
	                    .setTitle('✅ Gold Grant Approved')
	                    .addFields(
	                        { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
	                        { name: 'Character',    value: entry.target.characterName,     inline: true },
	                        { name: 'Player',       value: `<@${entry.target.discordId}>`, inline: true },
	                        { name: 'Approved By',  value: `<@${interaction.user.id}>`,    inline: true },
	                        { name: 'Requested By', value: `<@${entry.dm.discordId}>`,     inline: true },
	                        { name: 'Amount',       value: `+${entry.payload.amount} gp`,  inline: true },
	                        { name: 'Action ID',    value: `\`${entry.id}\``,             inline: false },
	                    )
	                    .setTimestamp()
	                );
	            } catch (logErr) {
	                console.warn(`[leagueadmin approve] Gold applied for ${id} but admin log failed:`, logErr.message);
	            }
	            results.push(`✅ \`${id}\` — **${entry.target.characterName}** (gold) approved.`);
	            continue;
	        }

            if (entry.type === 'milestone') {
                const character = await getActiveCharacter(entry.target.discordId);
                if (!character) {
                    results.push(`❌ \`${id}\` — **${entry.target.characterName}** no longer has an active character, skipped.`);
                    continue;
                }

                const result = await applyMilestones(client, interaction.guild, character, entry.target.characterName, entry.payload.amount);
                removeById(id);
                const { currentLevel, newLevel, milestonesConsumed, milestonesRemaining, levelUps } = result;

                const embedFields = [
                    { name: 'Quest',                value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
                    { name: 'Character',            value: entry.target.characterName,     inline: true },
                    { name: 'Player',               value: `<@${entry.target.discordId}>`, inline: true },
                    { name: 'Approved By',          value: `<@${interaction.user.id}>`,    inline: true },
                    { name: 'Requested By',         value: `<@${entry.dm.discordId}>`,     inline: true },
                    { name: 'Milestones Granted',   value: `+${entry.payload.amount}`,     inline: true },
                    { name: 'Milestones Consumed',  value: `${milestonesConsumed}`,        inline: true },
                    { name: 'Milestones Remaining', value: `${milestonesRemaining}`,       inline: true },
                ];
                if (levelUps > 0) {
                    embedFields.push({ name: 'Level', value: `${currentLevel} → ${newLevel}`, inline: true });
                }

                try {
                    await sendAdminLog(interaction.guild, new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle('✅ Milestone Grant Approved')
                        .addFields(...embedFields)
                        .setTimestamp()
                    );
                } catch (logErr) {
                    console.warn(`[leagueadmin approve] Milestone applied for ${id} but admin log failed:`, logErr.message);
                }
                results.push(`✅ \`${id}\` — **${entry.target.characterName}** (milestone) approved.${levelUps > 0 ? ` Levelled up to **Level ${newLevel}**!` : ''}`);
                continue;
            }

            if (entry.type === 'item') {
	            const { itemName, type, subtype, rarity, itemValue, source, notes } = entry.payload;
	            const page = await createInventoryItem({
	                itemName, type, subtype, rarity, itemValue, source, notes,
	                characterPageId: entry.target.characterPageId,
	                sourceQuestId: entry.quest?.questPageId ?? null,
	                status: 'Owned',
	            });
	            removeById(id);
	            try {
	                await sendAdminLog(interaction.guild, new EmbedBuilder()
	                    .setColor(0x57f287)
	                    .setTitle('✅ Item Grant Approved')
	                    .addFields(
	                        { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
	                        { name: 'Item',         value: itemName,                           inline: true },
	                        { name: 'Rarity',       value: rarity,                             inline: true },
	                        { name: 'Character',    value: entry.target.characterName,         inline: true },
	                        { name: 'Player',       value: `<@${entry.target.discordId}>`,     inline: true },
	                        { name: 'Approved By',  value: `<@${interaction.user.id}>`,        inline: true },
	                        { name: 'Requested By', value: `<@${entry.dm.discordId}>`,         inline: true },
	                        { name: 'Notion ID',    value: `\`${page.id}\``,                  inline: false },
	                    )
	                    .setTimestamp()
	                );
	            } catch (logErr) {
	                console.warn(`[leagueadmin approve] Item created for ${id} but admin log failed:`, logErr.message);
	            }
	            results.push(`✅ \`${id}\` — **${entry.target.characterName}** (item) approved.`);
	            continue;
	        }

            
            if (entry.type === 'quest-link') {
                const { questId } = await approveQuestLink(entry, interaction);
                results.push(`✅ \`${id}\` — **${entry.payload.adventureName}** linked. Quest ID: \`${questId}\``);
                removeById(id);
                continue;
            }
            
            if (entry.type === 'quest-complete') {
                const summary = await applyReportLines(entry, { client, guild: interaction.guild });
                updateById(id, () => entry);

                if (summary.allResolved) {
                    const appliedLines = entry.payload.lines.filter(l => l.applyStatus === 'applied');
                    const appliedLinesText = appliedLines.length > 0
                        ? appliedLines.map(l => `**${l.characterName}** — ${l.type}: ${l.applyResult}`).join('\n')
                        : 'None';

                    await approveQuestComplete(entry, interaction, { appliedLinesText });
                    removeById(id);
                    results.push(`✅ \`${id}\` — **${entry.quest.questName}** completed, ${appliedLines.length} reward line(s) applied.`);
                } else {
                    entry.status = 'partially_failed';
                    updateById(id, () => entry);

                    const failedDetail = summary.failed.map(l => `**${l.characterName}** — ${l.type}: ${l.applyError}`).join('\n');
                    await sendAdminLog(interaction.guild, new EmbedBuilder()
                        .setColor(0xe67e22)
                        .setTitle(`⚠️ Manual Attention Needed — Quest Completion ${entry.quest?.questId ?? ''}`)
                        .setDescription('The quest has **not** been marked Completed yet — fix the failed line(s) below and re-approve to finish closing it out.')
                        .addFields(
                            { name: 'Requested By', value: `<@${entry.dm.discordId}>`, inline: true },
                            { name: 'Action ID',    value: `\`${entry.id}\``,          inline: true },
                            { name: 'Applied',      value: `${summary.applied.length}`, inline: true },
                            { name: 'Failed lines', value: failedDetail || 'None',     inline: false },
                        )
                        .setTimestamp()
                    );

                    try {
                        const dmUser = await interaction.client.users.fetch(entry.dm.discordId);
                        await dmUser.send({ content: `Your completion for \`${entry.quest?.questId}\` hit an error on one or more reward lines — the quest hasn't been closed yet. Admins have been notified and are looking into it.` });
                    } catch (err) {
                        console.warn(`[leagueadmin approve] Failed to DM ${entry.dm.discordId} about partial failure:`, err.message);
                    }

                    results.push(`⚠️ \`${id}\` — quest completion partially applied (${summary.applied.length} ok, ${summary.failed.length} failed). Quest NOT marked completed — left pending for manual fix + re-approve.`);
                }
                continue;
            }

            if (entry.type === 'quest-cancel') {
                await approveQuestCancel(entry, interaction);
                results.push(`✅ \`${id}\` — **${entry.quest.questName}** cancelled.`);
                removeById(id);
                continue;
            }

            if (entry.type === 'quest-report') {
                const summary = await applyReportLines(entry, { client, guild: interaction.guild });
                updateById(id, () => entry);

                const skippedNote = summary.skipped.length > 0
                    ? ` (${summary.skipped.length} admin-rejected line(s) left out)`
                    : '';

                if (summary.allResolved) {
                    if (entry.quest?.questId) questDrafts.deleteDraft(entry.quest.questId);
                    removeById(id);

                    const appliedLines = entry.payload.lines.filter(l => l.applyStatus === 'applied');
                    await sendAdminLog(interaction.guild, buildByCharacterEmbed(
                        { ...entry.payload, lines: appliedLines, questId: entry.quest?.questId, questName: entry.quest?.questName, status: 'approved' },
                        [...new Map(appliedLines.map(l => [l.characterPageId, { characterPageId: l.characterPageId, characterName: l.characterName }])).values()],
                    ).setTitle(`✅ Quest Report Approved — ${entry.quest?.questName ?? ''} (\`${entry.quest?.questId ?? '?'}\`)${skippedNote}`));

                    results.push(`✅ \`${id}\` — quest report for **${entry.quest?.questName ?? entry.quest?.questId}** approved${skippedNote}.`);
                } else {
                    entry.status = 'partially_failed';
                    updateById(id, () => entry);

                    const failedDetail = summary.failed.map(l => `**${l.characterName}** — ${l.type}: ${l.applyError}`).join('\n');
                    await sendAdminLog(interaction.guild, new EmbedBuilder()
                        .setColor(0xe67e22)
                        .setTitle(`⚠️ Manual Attention Needed — Quest Report ${entry.quest?.questId ?? ''}`)
                        .addFields(
                            { name: 'Requested By', value: `<@${entry.dm.discordId}>`, inline: true },
                            { name: 'Action ID',    value: `\`${entry.id}\``,          inline: true },
                            { name: 'Applied',      value: `${summary.applied.length}`, inline: true },
                            { name: 'Failed lines', value: failedDetail || 'None',     inline: false },
                        )
                        .setTimestamp()
                    );

                    try {
                        const dmUser = await interaction.client.users.fetch(entry.dm.discordId);
                        await dmUser.send({ content: `Your report for \`${entry.quest?.questId}\` was approved — most rewards were granted, but one or more items hit an error. Admins have been notified and are looking into it.` });
                    } catch (err) {
                        console.warn(`[leagueadmin approve] Failed to DM ${entry.dm.discordId} about partial failure:`, err.message);
                    }

                    results.push(`⚠️ \`${id}\` — quest report partially applied (${summary.applied.length} ok, ${summary.failed.length} failed)${skippedNote}. Left pending for manual fix + re-approve.`);
                }
                continue;
            }

            if (entry.type === 'downtime-start') {
                const { uid, quantity } = entry.payload;
                const resolved = getBlueprintById(uid);
                if (!resolved) {
                    results.push(`❌ \`${id}\` — refers to a UID (\`${uid}\`) that no longer exists. Not approved — consider rejecting it instead.`);
                    continue;
                }
                const { key, blueprint } = resolved;
                const cost = resolveCostFromUID(uid, quantity ?? 1);
                if (!cost) {
                    results.push(`❌ \`${id}\` — could not resolve a valid cost for **${blueprint.name}** (UID \`${uid}\`). Not approved.`);
                    continue;
                }

                const dtaId = nextDtaId();
                try {
                    await createDowntimeProgress({
                        dtaId, activityId: key, activityName: blueprint.name, characterPageId: entry.target.characterPageId,
                        activityType: blueprint.category, daysRequired: cost.daysRequired,
                        daysInvested: 0, goldRequired: cost.gpTotal, goldInvested: 0, paramValue: cost.tierValue,
                        quantity: quantity ?? 1, spellName: entry.payload.spellName ?? null, itemChoice: entry.payload.itemChoice ?? null,
                    });
                } catch (err) {
                    console.error(`[leagueadmin approve] Notion error creating downtime progress for ${id}:`, err);
                    results.push(`❌ \`${id}\` — failed to create the downtime activity. Please try again.`);
                    continue;
                }

                removeById(id);
                await sendAdminLog(interaction.guild, new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('✅ Downtime Start Approved')
                    .addFields(
                        { name: 'Action ID',  value: `\`${id}\``, inline: true },
                        { name: 'DTA ID',     value: `\`${dtaId}\``, inline: true },
                        { name: 'Activity',   value: blueprint.name, inline: true },
                        { name: 'Character',  value: entry.target.characterName, inline: true },
                        { name: 'Player',     value: `<@${entry.dm.discordId}>`, inline: true },
                        { name: 'Approved By',value: `<@${interaction.user.id}>`, inline: true },
                    )
                    .setTimestamp()
                );
                results.push(`✅ \`${id}\` — **${blueprint.name}** approved and started as \`${dtaId}\`.`);
                continue;
            }

            if (entry.type === 'downtime-completion') {
                const { dtaId, notionPageId, activityId, activityName, tierValue, quantity, spellName, itemChoice } = entry.payload;

                await setDowntimeStatus(notionPageId, 'Completed');

                let outputResult = null;
                const blueprint = activityId ? getBlueprint(activityId) : null;
                if (blueprint?.output) {
                    try {
                        outputResult = await applyDowntimeOutput({
                            output: blueprint.output, characterPageId: entry.target.characterPageId, activityName, tierValue,
                            quantity, spellName, itemChoice, sourceQuestId: null,
                        }, leagueNotion, interaction.client, interaction.guild);
                    } catch (err) {
                        console.error(`[leagueadmin approve] Failed to apply downtime output for ${id}:`, err);
                    }
                }

                removeById(id);
                await sendAdminLog(interaction.guild, new EmbedBuilder()
                    .setColor(outputResult?.needsManualGrant ? 0xe67e22 : 0x57f287)
                    .setTitle(outputResult?.needsManualGrant ? '🎒 Downtime Output — Manual Grant Needed' : '✅ Downtime Completion Approved')
                    .addFields(
                        { name: 'Action ID',  value: `\`${id}\``, inline: true },
                        { name: 'DTA ID',     value: `\`${dtaId}\``, inline: true },
                        { name: 'Activity',   value: activityName, inline: true },
                        { name: 'Character',  value: entry.target.characterName, inline: true },
                        { name: 'Player',     value: `<@${entry.dm.discordId}>`, inline: true },
                        { name: 'Approved By',value: `<@${interaction.user.id}>`, inline: true },
                        ...(outputResult ? [{ name: 'Output', value: outputResult.message, inline: false }] : []),
                    )
                    .setTimestamp()
                );
                results.push(`✅ \`${id}\` — **${activityName}** completion approved.${outputResult ? ` ${outputResult.message}` : ''}`);
                continue;
            }

            removeById(id);
            results.push(`✅ \`${id}\` — **${entry.target.characterName}** (${entry.type}) approved.`);

        } catch (err) {
            console.error(`[leagueadmin approve] Error applying action ${id}:`, err);
            results.push(`❌ \`${id}\` — error applying, skipped. Check logs.`);
        }
    }

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leagueadmin clear ────────────────────────────────────────────────────────
async function handleClear(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    const ids = interaction.options.getString('id').split(',').map(s => s.trim()).filter(Boolean);
    await interaction.deferReply({ flags: 64 });

    const results = [];

    for (const id of ids) {
        const entry = getById(id);
        if (!entry) {
            results.push(`❌ \`${id}\` — not found.`);
            continue;
        }

        removeById(id);

        try {
            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0x99aab5)
                .setTitle('🗑️ Pending Action Force-Cleared')
                .setDescription('⚠️ Removed from the pending queue directly — no approve/reject logic ran. If the underlying change had already applied before this got stuck, it was **not** verified or undone here. Check the character/quest/inventory manually if unsure.')
                .addFields(
                    { name: 'Action ID',    value: `\`${entry.id}\``,                                                                 inline: true },
                    { name: 'Type',         value: entry.type,                                                                        inline: true },
                    { name: 'Status',       value: entry.status ?? 'pending',                                                         inline: true },
                    { name: 'Target',       value: entry.target?.characterName ?? entry.quest?.questName ?? 'N/A',                    inline: true },
                    { name: 'Requested By', value: entry.dm?.discordId ? `<@${entry.dm.discordId}>` : 'N/A',                          inline: true },
                    { name: 'Cleared By',   value: `<@${interaction.user.id}>`,                                                       inline: true },
                )
                .setTimestamp()
            );
        } catch (logErr) {
            console.warn(`[leagueadmin clear] Cleared ${id} but admin log failed:`, logErr.message);
        }

        results.push(`🗑️ \`${id}\` (${entry.type}) — force-cleared from pending queue.\n⚠️ **Warning:** this did not approve, reject, undo, or verify anything. If this action's change (gold, item, rep, etc.) had already partially applied before it got stuck, that change is still in effect — check manually before re-issuing the grant.`);
    }

    return interaction.editReply({ content: results.join('\n\n') });
}

// ─── /leagueadmin reject ──────────────────────────────────────────────────────────────────
async function handleReject(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    const ids = interaction.options.getString('id').split(',').map(s => s.trim()).filter(Boolean);
    const reason = interaction.options.getString('reason');
    const lineId = interaction.options.getString('line');
    await interaction.deferReply({ flags: 64 });

    if (lineId && ids.length !== 1) {
        return interaction.editReply({ content: '❌ `line` can only be used when rejecting a single `id`.' });
    }

    const results = [];

    for (const id of ids) {
        const entry = getById(id);
        if (!entry) {
            results.push(`❌ \`${id}\` — not found.`);
            continue;
        }

        if (lineId) {
            if (entry.type !== 'quest-report' && entry.type !== 'quest-complete') {
                results.push(`❌ \`${id}\` — \`line\` is only valid for quest-report / quest-complete entries.`);
                continue;
            }
            let line;
            try {
                line = rejectReportLine(entry, lineId, reason ?? 'No reason given.');
            } catch (err) {
                results.push(`❌ \`${id}\` — ${err.message}`);
                continue;
            }
            updateById(id, () => entry);

            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('❌ Quest Report Line Rejected')
                .setDescription('This line is left out of the report — the DM will not be asked to fix or resubmit it.')
                .addFields(
                    { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
                    { name: 'Character',    value: line.characterName,                  inline: true },
                    { name: 'Line Type',    value: line.type,                           inline: true },
                    { name: 'Rejected By',  value: `<@${interaction.user.id}>`,         inline: true },
                    { name: 'Reason',       value: reason ?? 'No reason given.',        inline: false },
                    { name: 'Action ID',    value: `\`${entry.id}\` (line \`${lineId}\`)`, inline: false },
                )
                .setTimestamp()
            );

            results.push(`✅ \`${id}\` — line \`${lineId}\` (**${line.characterName}**, ${line.type}) rejected and left out. Report \`${id}\` still pending for the rest.`);
            continue;
        }

        if (entry.type === 'quest-report' || entry.type === 'quest-complete') {
            if (!reason) {
                results.push(`❌ \`${id}\` — a \`reason\` is required to reject a quest completion.`);
                continue;
            }

            if (entry.quest?.questId) questDrafts.restoreDraft(entry.quest.questId);
            removeById(id);

            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('❌ Quest Completion Rejected')
                .addFields(
                    { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
                    { name: 'Rejected By',  value: `<@${interaction.user.id}>`,     inline: true },
                    { name: 'Requested By', value: `<@${entry.dm.discordId}>`,      inline: true },
                    { name: 'Reason',       value: reason,                          inline: false },
                    { name: 'Action ID',    value: `\`${entry.id}\``,               inline: false },
                )
                .setTimestamp()
            );

            try {
                const dmUser = await interaction.client.users.fetch(entry.dm.discordId);
                await dmUser.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xed4245)
                            .setTitle('Your quest completion was rejected')
                            .setDescription(
                                `**Quest:** ${entry.quest?.questName ?? 'Unknown'} (\`${entry.quest?.questId ?? '?'}\`)\n` +
                                `**Reason:** ${reason}\n\n` +
                                `The quest is still Active and your draft has been restored with everything you had — run \`/leaguedm dashboard ${entry.quest?.questId ?? ''}\` to make changes and try Complete Quest again.`
                            )
                            .setTimestamp()
                    ]
                });
            } catch (err) {
                console.warn(`[leagueadmin reject] Failed to DM ${entry.dm.discordId}:`, err.message);
            }

            results.push(`✅ \`${id}\` — quest completion for **${entry.quest?.questName ?? entry.quest?.questId}** rejected, draft restored to DM.`);
            continue;
        }

        // ── Quest cancellation reject ──
        if (entry.type === 'quest-cancel') {
            removeById(id);

            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('❌ Quest Cancellation Rejected')
                .addFields(
                    { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
                    { name: 'Rejected By',  value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Requested By', value: `<@${entry.dm.discordId}>`,  inline: true },
                    { name: 'Action ID',    value: `\`${entry.id}\``,           inline: false },
                )
                .setTimestamp()
            );

            try {
                const dmUser = await interaction.client.users.fetch(entry.dm.discordId);
                await dmUser.send({
                    content: `Your request to cancel quest **${entry.quest?.questName ?? entry.quest?.questId}** was rejected. The quest remains active.`,
                });
            } catch (err) {
                console.warn(`[leagueadmin reject] Failed to DM ${entry.dm.discordId}:`, err.message);
            }

            results.push(`✅ \`${id}\` — quest cancellation for **${entry.quest?.questName ?? entry.quest?.questId}** rejected, quest remains active.`);
            continue;
        }

        if (entry.type === 'downtime-start') {
            if (!reason) {
                results.push(`❌ \`${id}\` — a \`reason\` is required to reject a downtime start request.`);
                continue;
            }
            removeById(id);

            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('❌ Downtime Start Rejected')
                .addFields(
                    { name: 'Activity',     value: entry.details?.activityName ?? 'Unknown', inline: true },
                    { name: 'Character',    value: entry.target.characterName, inline: true },
                    { name: 'Player',       value: `<@${entry.dm.discordId}>`, inline: true },
                    { name: 'Rejected By',  value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason',       value: reason, inline: false },
                    { name: 'Action ID',    value: `\`${id}\``, inline: false },
                )
                .setTimestamp()
            );

            try {
                const dmUser = await interaction.client.users.fetch(entry.dm.discordId);
                await dmUser.send({ content: `Your request to start **${entry.details?.activityName ?? 'a downtime activity'}** on **${entry.target.characterName}** was rejected.\n**Reason:** ${reason}` });
            } catch (err) {
                console.warn(`[leagueadmin reject] Failed to DM ${entry.dm.discordId}:`, err.message);
            }

            results.push(`✅ \`${id}\` — downtime start for **${entry.target.characterName}** rejected, no activity created.`);
            continue;
        }

        if (entry.type === 'downtime-completion') {
            if (!reason) {
                results.push(`❌ \`${id}\` — a \`reason\` is required to reject a downtime completion.`);
                continue;
            }
            const { dtaId, notionPageId, activityName } = entry.payload;

            try {
                await setDowntimeStatus(notionPageId, 'In Progress');
            } catch (err) {
                console.error(`[leagueadmin reject] Failed to revert downtime status for ${id}:`, err);
                results.push(`❌ \`${id}\` — failed to revert \`${dtaId}\` to In Progress. Check logs before retrying.`);
                continue;
            }
            removeById(id);

            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('❌ Downtime Completion Rejected')
                .addFields(
                    { name: 'Activity',     value: activityName ?? 'Unknown', inline: true },
                    { name: 'DTA ID',       value: `\`${dtaId}\``, inline: true },
                    { name: 'Character',    value: entry.target.characterName, inline: true },
                    { name: 'Player',       value: `<@${entry.dm.discordId}>`, inline: true },
                    { name: 'Rejected By',  value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason',       value: reason, inline: false },
                    { name: 'Action ID',    value: `\`${id}\``, inline: false },
                )
                .setTimestamp()
            );

            try {
                const dmUser = await interaction.client.users.fetch(entry.dm.discordId);
                await dmUser.send({ content: `Your completion of **${activityName ?? 'a downtime activity'}** (\`${dtaId}\`) on **${entry.target.characterName}** was rejected and put back to In Progress.\n**Reason:** ${reason}\nUse \`/league downtime progress\` once it's ready to resubmit.` });
            } catch (err) {
                console.warn(`[leagueadmin reject] Failed to DM ${entry.dm.discordId}:`, err.message);
            }

            results.push(`✅ \`${id}\` — completion for \`${dtaId}\` rejected, reverted to In Progress.`);
            continue;
        }

        removeById(id);

        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Grant Rejected')
            .addFields(
                { name: 'Type',         value: entry.type,                         inline: true },
                { name: 'Character',    value: entry.target.characterName,         inline: true },
                { name: 'Player',       value: `<@${entry.target.discordId}>`,     inline: true },
                { name: 'Rejected By',  value: `<@${interaction.user.id}>`,        inline: true },
                { name: 'Requested By', value: `<@${entry.dm.discordId}>`,         inline: true },
                { name: 'Amount',       value: `+${entry.payload.amount}`,         inline: true },
                { name: 'Action ID',    value: `\`${entry.id}\``,                 inline: false },
            )
            .setTimestamp()
        );

        results.push(`✅ \`${id}\` — **${entry.target.characterName}** (${entry.type}) rejected.`);
    }

    return interaction.editReply({ content: results.join('\n') });
}

module.exports = {
    handleDashboard,
    handlePending,
    handleApprove,
    handleClear,
    handleReject,
};
