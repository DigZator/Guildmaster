module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        try {
            if (interaction.customId === 'announce_edit_select') {
                require('../selects/announceEditSelect')(interaction, client);
            }
            if (interaction.customId === 'shopbuy_discount_select') {
                require('../selects/shopDiscountSelect')(interaction, client);
            }
        } catch (error) {
            console.error('Error handling select menu:', error);
        }
    });
};
