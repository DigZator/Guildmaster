const { getCharacterGold, adjustCharacterNumbersUnlocked, withPageLock, setItemStatus } = require('../utils/leagueNotion');
const { getPendingSell, clearPendingSell } = require('../utils/shopSellSessions');
const { formatCurrency } = require('../utils/currency');
const { EmbedBuilder } = require('discord.js');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

async function sendAdminLog(guild, embed) {
    const channel = guild.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
    if (channel) await channel.send({ embeds: [embed] });
    else console.warn('[shopSell] LEAGUE_ADMIN_CHANNEL_ID not found in cache.');
}

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
            try {
                currentGold = await withPageLock(char.id, async () => {
                    const gold = await getCharacterGold(char.id);
                    await Promise.all([
                        adjustCharacterNumbersUnlocked(char.id, { Gold: totalPrice }),
                        ...items.map(i => setItemStatus(i.pageId, 'Sold')),
                    ]);
                    return gold;
                });
            } catch (err) {
                console.error('[shopsell_confirm_yes] Notion write error:', err);
                return interaction.editReply({ content: '❌ Sale failed partway through. Please contact an admin to verify your inventory and gold.', components: [] });
            }

            const itemLines = items.map(i => `**${i.name}** (\`#${String(i.serial).padStart(3, '0')}\`) — ${formatCurrency(i.sellPrice)}`);

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
