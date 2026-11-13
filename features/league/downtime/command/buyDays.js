const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getActiveCharacter } = require('../../notion');

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

module.exports = { handleDowntimeBuyDays, REP_COST_PER_TOPUP, DAYS_PER_TOPUP };
