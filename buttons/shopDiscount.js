const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getPendingBuy, clearPendingBuy } = require('../utils/shopBuySessions');
const { formatCurrency } = require('../utils/currency');

module.exports = {

    exact: {

        shopbuy_discount_no: async (interaction) => {
            await interaction.deferUpdate();

            const pending = getPendingBuy(interaction.user.id);
            if (!pending) return interaction.editReply({ content: '❌ This purchase prompt expired. Please run `/league shop buy` again.', components: [] });

            clearPendingBuy(interaction.user.id);
            const { finalizePurchase } = require('../commands/leagueShop');
            const { char, characterName, code, entry, currentGold } = pending;
            return finalizePurchase(interaction, { char, characterName, code, entry, currentGold });
        },

        shopbuy_discount_yes: async (interaction) => {
            await interaction.deferUpdate();

            const pending = getPendingBuy(interaction.user.id);
            if (!pending) return interaction.editReply({ content: '❌ This purchase prompt expired. Please run `/league shop buy` again.', components: [] });

            const { entry, discounts } = pending;

            const select = new StringSelectMenuBuilder()
                .setCustomId('shopbuy_discount_select')
                .setPlaceholder('Choose a discount')
                .addOptions(
                    discounts.map(d => ({
                        label: `${d.discount}% off — costs ${d.rpCost} RP`,
                        description: `${formatCurrency(entry.price)} → ${formatCurrency(Math.round(entry.price * (1 - d.discount / 100)))}`,
                        value: String(d.discount),
                    }))
                );

            return interaction.editReply({
                content: `**${entry.name}** — pick a discount to apply:`,
                components: [new ActionRowBuilder().addComponents(select)],
            });
        },

    },

};
