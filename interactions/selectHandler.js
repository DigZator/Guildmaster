module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        try {
            if (interaction.customId === 'announce_edit_select') {
                await require('../selects/announceEditSelect')(interaction, client);
            }
            if (interaction.customId === 'shopbuy_discount_select') {
                await require('../selects/shopDiscountSelect')(interaction, client);
            }
            if (interaction.customId === 'starter_items_select') {
                await require('../selects/starterItemsSelect')(interaction, client);
            }
        } catch (error) {
            if (error.code === 10062) {
                console.warn(`[selectHandler] Interaction expired before we could respond: ${interaction.customId}`);
                return;
            }
            console.error('Error handling select menu:', error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Something went wrong.', flags: 64 });
                } else {
                    await interaction.reply({ content: 'Something went wrong.', flags: 64 });
                }
            } catch (replyError) {
                console.warn('[selectHandler] Fallback reply also failed:', replyError.message);
            }
        }
    });
};
