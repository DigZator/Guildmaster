const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../../utils/isAdminChannel');
const {
    getActiveCharacter,
    adjustCharacterNumber,
    createInventoryItem,
    setDowntimeStatus,
    createDowntimeProgress,
} = require('../../../utils/leagueNotion');
const leagueNotion = require('../../../utils/leagueNotion');
const { applyMilestones } = require('../../../utils/milestones');
const { getById, removeById, updateById } = require('../../../utils/pendingActions');
const { applyReportLines } = require('../../../utils/questReportAppliers');
const { buildByCharacterEmbed } = require('../../../utils/questReportEmbed');
const questDrafts = require('../../../utils/questDrafts');
const { approveQuestLink, approveQuestComplete, approveQuestCancel } = require('../../leagueQuest');
const { getBlueprint, nextDtaId, getBlueprintById, resolveCostFromUID, applyDowntimeOutput } = require('../../../utils/downtime');
const { sendAdminLog } = require('../../../utils/adminLog');

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

module.exports = {
    handleApprove,
};
