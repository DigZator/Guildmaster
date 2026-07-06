const { EmbedBuilder } = require('discord.js');
const { getQuestSummary, buildQuestSummaryEmbed } = require('../commands/leagueQuest');
const { addAction } = require('../utils/pendingActions');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

module.exports = {
    prefix: {

        'qc_confirm:': async (interaction) => {
             const [, questId, milestones, reputation] = interaction.customId.split(':');
 
             await interaction.update({ content: '⏳ Submitting...', embeds: [], components: [] });
 
             try {
                 const summary = await getQuestSummary(questId, {
                     milestones: parseInt(milestones),
                     reputation: parseInt(reputation),
                 });
 
                 if (!summary) {
                     return interaction.editReply({
                         content: `❌ Could not find quest \`${questId}\`. Please contact an admin.`,
                     });
                 }
 
                 const entry = addAction({
                     type: 'quest-complete',
                     dm: { discordId: interaction.user.id, username: interaction.user.username },
                     quest: { questId: summary.questId, questName: summary.adventureName, questPageId: summary.questPageId },
                     payload: { milestones: parseInt(milestones), reputation: parseInt(reputation) },
                 });
 
                 const adminEmbed = buildQuestSummaryEmbed(summary, {
                     title: '⏳ Quest Completion — Pending Approval',
                     color: 0x5865f2,
                 });
                 adminEmbed.addFields(
                     { name: 'Requested By', value: `<@${interaction.user.id}>`, inline: true },
                     { name: 'Action ID',    value: `\`${entry.id}\``,           inline: true },
                 );
 
                 const adminChannel = interaction.guild.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
                 if (adminChannel) {
                     await adminChannel.send({ embeds: [adminEmbed] });
                 } else {
                     console.warn('[questComplete] Admin channel not found in cache.');
                 }
 
                 return interaction.editReply({
                     content: `✅ Quest completion for **${summary.adventureName}** submitted for approval. Action ID: \`${entry.id}\``,
                 });
 
             } catch (err) {
                 console.error('[qc_confirm] Error:', err);
                 return interaction.editReply({ content: '❌ Something went wrong. Check logs.' });
             }
         },

        'qc_cancel': async (interaction) => {
            return interaction.update({ content: '❌ Quest completion cancelled.', embeds: [], components: [] });
        },

    }
};
