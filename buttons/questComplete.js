const { getQuestSummary, buildQuestSummaryEmbed, confirmQuestCompletion } = require('../commands/leagueQuest');

module.exports = {
    prefix: {

        'qc_confirm:': async (interaction) => {
             const [, questId] = interaction.customId.split(':');

             await interaction.update({ content: '⏳ Submitting...', embeds: [], components: [] });

             try {
                 const summary = await getQuestSummary(questId);

                 if (!summary) {
                     return interaction.editReply({
                         content: `❌ Could not find quest \`${questId}\`. Please contact an admin.`,
                     });
                 }

                 const dm = { discordId: interaction.user.id, username: interaction.user.username };

                 const entry = await confirmQuestCompletion(questId, dm, interaction.guild);

                 return interaction.editReply({
                     content: `✅ Quest completion for **${summary.adventureName}** submitted for admin approval. Action ID: \`${entry.id}\`.`,
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
