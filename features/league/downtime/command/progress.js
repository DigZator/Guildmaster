const { EmbedBuilder } = require('discord.js');
const {
    getActiveCharacter,
    getDowntimeProgressById,
    investDowntimeProgress,
    setDowntimeStatus,
    getCharacterGold,
    adjustCharacterNumbersUnlocked,
    withPageLock,
} = require('../../../../utils/leagueNotion');
const { addAction } = require('../../../../utils/pendingActions');
const { loadBlueprints, getBlueprint, applyDowntimeOutput } = require('../engine');
const leagueNotion = require('../../../../utils/leagueNotion');
const { formatCurrency } = require('../../../../utils/currency');
const { sendAdminLog } = require('../../../../utils/adminLog');
const { coerceParam, postToCharacterThread } = require('./helpers');

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
    const storedQuantity = p['Quantity']?.number ?? 1;
    const storedSpell    = p['Spell Name']?.rich_text?.[0]?.plain_text ?? null;
    const storedItem     = p['Item Choice']?.rich_text?.[0]?.plain_text ?? null;

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

    let stage = 'none'; // none -> resources_deducted -> progress_logged -> complete
    try {
        await withPageLock(char.id, async () => {
            const gold = await getCharacterGold(char.id);
            if (gold < gpCost) {
                throw Object.assign(new Error('insufficient-gold'), { code: 'INSUFFICIENT_GOLD', gold });
            }
            await adjustCharacterNumbersUnlocked(char.id, { 'Gold': -gpCost, 'Downtime Days': -days });
            stage = 'resources_deducted';

            await investDowntimeProgress(progress.id, { daysInvested: newDaysInvested, goldInvested: newGoldInvested });
            stage = 'progress_logged';

            if (isComplete) await setDowntimeStatus(progress.id, needsCompletionApproval ? 'Pending Completion Approval' : 'Completed');
            stage = 'complete';
            return gold;
        });
    } catch (err) {
        if (err.code === 'INSUFFICIENT_GOLD') {
            return interaction.editReply({ content: `❌ Not enough gold. This costs **${formatCurrency(gpCost)}** for ${days} day(s), you have **${formatCurrency(err.gold)}**.` });
        }
        console.error('[downtime progress] Notion error:', err, { stage });
        if (stage !== 'none') {
            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Downtime Progress Failed Mid-Transaction — Needs Reconciliation')
                .setDescription(`Failed at stage \`${stage}\`. Error: ${err.message}`)
                .addFields(
                    { name: 'Character',       value: char.properties['Character Name']?.title?.[0]?.plain_text ?? char.id, inline: true },
                    { name: 'Player',          value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Gold/Days Deducted?', value: stage === 'none' ? 'No' : 'Yes', inline: true },
                    { name: 'Gold Cost',       value: `${formatCurrency(gpCost)}`, inline: true },
                    { name: 'Days Cost',       value: `${days}`,                    inline: true },
                    { name: 'Progress Logged?', value: (stage === 'progress_logged' || stage === 'complete') ? 'Yes' : 'No — days/gold were deducted but progress was not recorded', inline: false },
                )
                .setTimestamp()
            );
            return interaction.editReply({ content: '❌ Something went partly wrong logging your progress. Your gold/days may already be spent — an admin has been notified to reconcile it.' });
        }
        return interaction.editReply({ content: '❌ Failed to log progress. Please try again.' });
    }

    let outputResult = null;
    if (isComplete && !needsCompletionApproval && blueprint?.output) {
        const tierValue = coerceParam(storedParam);
        try {
            outputResult = await applyDowntimeOutput({
                output: blueprint.output, characterPageId: char.id, activityName, tierValue,
                quantity: storedQuantity, spellName: storedSpell, itemChoice: storedItem,
            }, leagueNotion, interaction.client, interaction.guild);
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

    let completionActionId = null;
    if (needsCompletionApproval) {
        const characterName = char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const created = addAction({
            type: 'downtime-completion',
            dm: { discordId: interaction.user.id }, // requester — the player whose activity completed
            target: { characterPageId: char.id, characterName, discordId: interaction.user.id },
            payload: {
                dtaId, notionPageId: progress.id, activityId, activityName,
                tierValue: coerceParam(storedParam), quantity: storedQuantity,
                spellName: storedSpell, itemChoice: storedItem,
            },
        });
        completionActionId = created.id;

        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle('⏳ Downtime Completion Approval Needed')
            .addFields(
                { name: 'Action ID', value: `\`${completionActionId}\``, inline: true },
                { name: 'DTA ID',    value: `\`${dtaId}\``, inline: true },
                { name: 'Activity',  value: activityName, inline: true },
                { name: 'Player',    value: `<@${interaction.user.id}>`, inline: true },
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
        content: (needsCompletionApproval
            ? `⏳ **${activityName}** — all ${daysRequired} day(s) logged! This activity requires an Admin sign-off before it finalizes. Completion approval request \`${completionActionId}\` sent to the admins.`
            : isComplete
	            ? `🎉 **${activityName}** complete!${outputResult ? ` ${outputResult.message}` : ''}`
	            : `✅ Logged ${days} day(s) on **${activityName}** (${newDaysInvested}/${daysRequired}). Spent ${formatCurrency(gpCost)}.`)
			+ ` (${currentDowntimeDays - days} downtime day(s) remaining)`,
    });
}

module.exports = { handleDowntimeProgress };
