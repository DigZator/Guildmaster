const { getActiveCharacter, adjustCharacterNumber } = require('../utils/leagueNotion');
const { REP_COST_PER_TOPUP, DAYS_PER_TOPUP } = require('../commands/leagueDowntime');

module.exports = {
    exact: {

        dtbuy_confirm: async (interaction) => {
            await interaction.update({ content: '⏳ Processing...', components: [] });

            const char = await getActiveCharacter(interaction.user.id).catch(() => null);
            if (!char) return interaction.editReply({ content: '❌ No active character found.', components: [] });

            const currentRep = char.properties['Reputation Points']?.number ?? 0;
            const currentDowntimeDays = char.properties['Downtime Days']?.number ?? 0;

            if (currentRep < REP_COST_PER_TOPUP) {
                return interaction.editReply({ content: `❌ You no longer have enough reputation (need ${REP_COST_PER_TOPUP}, have ${currentRep}).`, components: [] });
            }

            try {
                await Promise.all([
                    adjustCharacterNumber(char.id, 'Reputation Points', -REP_COST_PER_TOPUP),
                    adjustCharacterNumber(char.id, 'Downtime Days', DAYS_PER_TOPUP),
                ]);
            } catch (err) {
                console.error('[dtbuy_confirm] Notion error:', err);
                return interaction.editReply({ content: '❌ Something went wrong. Please try again.', components: [] });
            }

            return interaction.editReply({
                content: `✅ Spent **${REP_COST_PER_TOPUP} reputation point** for **+${DAYS_PER_TOPUP} downtime days**. New totals: **${currentRep - REP_COST_PER_TOPUP} RP**, **${currentDowntimeDays + DAYS_PER_TOPUP} downtime day(s)**.`,
                components: [],
            });
        },

        dtbuy_cancel: async (interaction) => {
            return interaction.update({ content: '❌ Cancelled — no reputation spent.', components: [] });
        },

    },
};
