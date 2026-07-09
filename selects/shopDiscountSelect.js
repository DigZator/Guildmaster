const { getPendingBuy, clearPendingBuy } = require('../utils/shopBuySessions');

module.exports = async (interaction) => {
    await interaction.deferUpdate();

    const pending = getPendingBuy(interaction.user.id);
    if (!pending) return interaction.editReply({ content: '❌ This purchase prompt expired. Please run `/league shop buy` again.', components: [] });

    const chosenDiscount = Number(interaction.values[0]);
    const match = pending.discounts.find(d => d.discount === chosenDiscount);
    if (!match) return interaction.editReply({ content: '❌ Invalid discount selection.', components: [] });

    clearPendingBuy(interaction.user.id);

    const { finalizePurchase } = require('../commands/leagueShop');
    const { char, characterName, code, entry, currentGold, currentRep } = pending;

    return finalizePurchase(interaction, {
        char, characterName, code, entry, currentGold, currentRep,
        discount: match.discount,
        rpCost: match.rpCost,
    });
};
