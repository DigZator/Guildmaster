const { getActiveCharacter, adjustCharacterNumbersUnlocked, withPageLock } = require('../utils/leagueNotion');
const { REP_COST_PER_TOPUP, DAYS_PER_TOPUP } = require('../commands/leagueDowntime');

module.exports = {
    exact: {

        dtbuy_confirm: async (interaction) => {
            await interaction.update({ content: '⏳ Processing...', components: [] });

            const char = await getActiveCharacter(interaction.user.id).catch(() => null);
            if (!char) return interaction.editReply({ content: '❌ No active character found.', components: [] });

            let newRep, newDays;
            try {
                ({ newRep, newDays } = await withPageLock(char.id, async () => {
                    const fresh = await getActiveCharacter(interaction.user.id);
                    const rep = fresh.properties['Reputation Points']?.number ?? 0;
                    const days = fresh.properties['Downtime Days']?.number ?? 0;
                    if (rep < REP_COST_PER_TOPUP) {
                        throw Object.assign(new Error('insufficient-rep'), { code: 'INSUFFICIENT_REP', rep });
                    }
                    await adjustCharacterNumbersUnlocked(char.id, {
                        'Reputation Points': -REP_COST_PER_TOPUP,
                        'Downtime Days': DAYS_PER_TOPUP,
                    });
                    return { newRep: rep - REP_COST_PER_TOPUP, newDays: days + DAYS_PER_TOPUP };
                }));
            } catch (err) {
                if (err.code === 'INSUFFICIENT_REP') {
                    return interaction.editReply({ content: `❌ You no longer have enough reputation (need ${REP_COST_PER_TOPUP}, have ${err.rep}).`, components: [] });
                }
                console.error('[dtbuy_confirm] Notion error:', err);
                return interaction.editReply({ content: '❌ Something went wrong. Please try again.', components: [] });
            }

            return interaction.editReply({
                content: `✅ Spent **${REP_COST_PER_TOPUP} reputation point** for **+${DAYS_PER_TOPUP} downtime days**. New totals: **${newRep} RP**, **${newDays} downtime day(s)**.`,
                components: [],
            });
        },

        dtbuy_cancel: async (interaction) => {
            return interaction.update({ content: '❌ Cancelled — no reputation spent.', components: [] });
        },

    },
};
