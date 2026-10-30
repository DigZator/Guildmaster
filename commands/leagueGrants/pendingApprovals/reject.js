const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../../utils/isAdminChannel');
const { setDowntimeStatus } = require('../../../utils/leagueNotion');
const { getById, removeById, updateById } = require('../../../utils/pendingActions');
const { rejectReportLine } = require('../../../utils/questReportAppliers');
const questDrafts = require('../../../utils/questDrafts');
const { sendAdminLog } = require('../../../utils/adminLog');

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
    handleReject,
};
