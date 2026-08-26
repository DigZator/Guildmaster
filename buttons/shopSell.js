const { getCharacterGold, adjustCharacterNumbersUnlocked, withPageLock, setItemStatus } = require('../utils/leagueNotion');
const { getPendingSell, clearPendingSell } = require('../utils/shopSellSessions');
const { formatCurrency } = require('../utils/currency');
const { EmbedBuilder } = require('discord.js');
const { sendAdminLog } = require('../utils/adminLog');

module.exports = {

    exact: {

        shopsell_confirm_no: async (interaction) => {
            await interaction.deferUpdate();

            const pending = getPendingSell(interaction.user.id);
            clearPendingSell(interaction.user.id);

            if (!pending) return interaction.editReply({ content: '❌ This sale prompt expired.', components: [] });

            return interaction.editReply({ content: '❌ Sale cancelled.', components: [] });
        },

        shopsell_confirm_yes: async (interaction) => {
            await interaction.deferUpdate();

            const pending = getPendingSell(interaction.user.id);
            if (!pending) return interaction.editReply({ content: '❌ This sale prompt expired. Please run `/league shop sell` again.', components: [] });

            clearPendingSell(interaction.user.id);

            const { char, characterName, items, totalPrice } = pending;

            let currentGold;
            const soldItems = [];
            const failedItems = [];
            let goldAdjusted = false;

            try {
                currentGold = await withPageLock(char.id, async () => {
                    const gold = await getCharacterGold(char.id);

                    // Gold first — if this fails, nothing else is attempted
                    await adjustCharacterNumbersUnlocked(char.id, { Gold: totalPrice });
                    goldAdjusted = true;

                    // Then item statuses, one at a time
                    for (const item of items) {
                        try {
                            await setItemStatus(item.pageId, 'Sold');
                            soldItems.push(item);
                        } catch (itemErr) {
                            console.error(`[shopsell_confirm_yes] Failed to mark item ${item.pageId} as Sold:`, itemErr);
                            failedItems.push(item);
                        }
                    }

                    return gold;
                });
            } catch (err) {
                console.error('[shopsell_confirm_yes] Notion write error:', err);
                if (!goldAdjusted) {
                    return interaction.editReply({ content: '❌ Sale failed. No gold or items were changed — please try again.', components: [] });
                }
                return interaction.editReply({ content: '❌ Sale failed partway through. Please contact an admin to verify your inventory and gold.', components: [] });
            }

            if (failedItems.length > 0) {
                const failedLines = failedItems.map(i => i.serial != null
                    ? `**${i.name}** (\`#${String(i.serial).padStart(3, '0')}\`) — ${formatCurrency(i.sellPrice)}`
                    : `**${i.name}** — ${formatCurrency(i.sellPrice)}`);
                const soldLines = soldItems.map(i => i.serial != null
                    ? `**${i.name}** (\`#${String(i.serial).padStart(3, '0')}\`) — ${formatCurrency(i.sellPrice)}`
                    : `**${i.name}** — ${formatCurrency(i.sellPrice)}`);

                await sendAdminLog(interaction.guild, new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle('⚠️ Shop Sale — Needs Reconciliation')
                    .setDescription(`Gold **was** credited in full, but ${failedItems.length} item(s) failed to update to "Sold" and still show as in-inventory. Please fix their status manually.`)
                    .addFields(
                        { name: 'Character',        value: characterName,               inline: true },
                        { name: 'Player',           value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Gold Credited',    value: `${formatCurrency(totalPrice)}`, inline: true },
                        { name: 'Marked Sold OK',   value: soldLines.length ? soldLines.join('\n') : '—', inline: false },
                        { name: 'Needs Fixing',     value: failedLines.join('\n'),        inline: false },
                    )
                    .setTimestamp()
                );

                return interaction.editReply({
                    content: `⚠️ Sold ${soldItems.length}/${items.length} item(s) — your gold balance was fully updated (**${formatCurrency(currentGold + totalPrice)}**), but ${failedItems.length} item(s) could not be marked as sold and an admin has been notified to fix it:\n${failedLines.join('\n')}`,
                    components: [],
                });
            }

            const itemLines = items.map(i => i.serial != null
                ? `**${i.name}** (\`#${String(i.serial).padStart(3, '0')}\`) — ${formatCurrency(i.sellPrice)}`
                : `**${i.name}** — ${formatCurrency(i.sellPrice)}`);

            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xe67e22)
                .setTitle('🏪 Shop Sale')
                .addFields(
                    { name: 'Character', value: characterName,               inline: true },
                    { name: 'Player',    value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Total',     value: `${formatCurrency(totalPrice)}`, inline: true },
                    { name: 'Items',     value: itemLines.join('\n'),        inline: false },
                )
                .setTimestamp()
            );

            return interaction.editReply({
                content: `✅ Sold ${items.length} item(s) for **${formatCurrency(totalPrice)}**. New balance: **${formatCurrency(currentGold + totalPrice)}**.`,
                components: [],
            });
        },

    },

};
