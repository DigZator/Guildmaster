const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getActiveCharacter,
    adjustCharacterNumbersUnlocked,
    withPageLock,
    createInventoryItem,
    getCharacterGold,
} = require('../../../utils/leagueNotion');
const { tierMinFor, getBuyableEntry, decrementStock } = require('../../../utils/shopFloor');
const { formatCurrency } = require('../../../utils/currency');
const { availableDiscounts } = require('../../../config/reputationDiscounts');
const { setPendingBuy } = require('../../../utils/shopBuySessions');
const { sendAdminLog } = require('../../../utils/adminLog');

// ─── /league shop buy ─────────────────────────────────────────────────────────

async function finalizePurchase(interaction, { char, characterName, code, entry, discount = 0, rpCost = 0, currentRep = 0 }) {
    const finalPrice = Math.max(0, Math.round(entry.price * (1 - discount / 100)));

    if (rpCost > 0 && currentRep < rpCost) {
        return interaction.editReply({ content: `❌ Not enough reputation for that discount anymore. You need **${rpCost} RP** but have **${currentRep}**.`, components: [] });
    }

    if (!entry.isVariantCombo) {
        const updated = decrementStock(code);
        if (!updated) return interaction.editReply({ content: `❌ **${entry.name}** is out of stock.`, components: [] });
    }

    let goldBefore;
    let stage = 'none'; // none -> gold_deducted -> item_created -> complete
    try {
        goldBefore = await withPageLock(char.id, async () => {
            const gold = await getCharacterGold(char.id);
            if (gold < finalPrice) throw new Error('INSUFFICIENT_GOLD');

            await adjustCharacterNumbersUnlocked(char.id, { Gold: -finalPrice });
            stage = 'gold_deducted';

            await createInventoryItem({
                itemName: entry.name,
                type: entry.type,
                rarity: entry.rarity,
                itemValue: entry.price,
                source: 'Shop Purchase',
                characterPageId: char.id,
                status: 'Owned',
            });
            stage = 'item_created';

            if (rpCost > 0) await adjustCharacterNumbersUnlocked(char.id, { 'Reputation Points': -rpCost });
            stage = 'complete';

            return gold;
        });
    } catch (err) {
        if (err.message === 'INSUFFICIENT_GOLD') {
            return interaction.editReply({ content: `❌ Not enough gold. **${entry.name}** costs **${formatCurrency(finalPrice)}**.`, components: [] });
        }
        console.error('[league shop buy] Notion write error:', err, { stage });
        if (stage !== 'none') {
            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Shop Purchase Failed Mid-Transaction — Needs Reconciliation')
                .setDescription(`Failed at stage \`${stage}\`. Error: ${err.message}`)
                .addFields(
                    { name: 'Character',        value: characterName,               inline: true },
                    { name: 'Player',           value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Item',             value: entry.name,                  inline: true },
                    { name: 'Gold Deducted?',   value: stage === 'none' ? 'No' : 'Yes', inline: true },
                    { name: 'Item Created?',    value: (stage === 'item_created' || stage === 'complete') ? 'Yes' : 'No — gold was taken but item was never granted', inline: false },
                    { name: 'RP Deducted?',     value: rpCost > 0 ? (stage === 'complete' ? 'Yes' : 'No') : 'N/A', inline: true },
                )
                .setTimestamp()
            );
            return interaction.editReply({ content: '❌ Purchase failed partway through. Your gold may already be spent — an admin has been notified to reconcile it.', components: [] });
        }
        return interaction.editReply({ content: '❌ Purchase failed. Please try again.', components: [] });
    }

    const currentGold = goldBefore;

    const logFields = [
        { name: 'Item',      value: entry.name,                   inline: true },
        { name: 'Rarity',    value: entry.rarity,                 inline: true },
        { name: 'Price',     value: discount > 0
            ? `~~${formatCurrency(entry.price)}~~ ${formatCurrency(finalPrice)} (${discount}% off)`
            : `${formatCurrency(entry.price)}`,                   inline: true },
        { name: 'Character', value: characterName,                inline: true },
        { name: 'Player',    value: `<@${interaction.user.id}>`,  inline: true },
        { name: '\u200b',    value: '\u200b',                     inline: true },
        { name: 'Code',      value: `\`${code}\``,                inline: false },
    ];
    if (rpCost > 0) {
        logFields.push({ name: 'RP Spent', value: `${rpCost} (balance: ${currentRep - rpCost})`, inline: true });
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🏪 Shop Purchase')
        .addFields(...logFields)
        .setTimestamp()
    );

    const priceLine = discount > 0
        ? `~~${formatCurrency(entry.price)}~~ **${formatCurrency(finalPrice)}** (${discount}% off, ${rpCost} RP spent)`
        : `**${formatCurrency(finalPrice)}**`;

    return interaction.editReply({
        content: `✅ Purchased **${entry.name}** for ${priceLine}. New balance: **${formatCurrency(currentGold - finalPrice)}**.`,
        components: [],
    });
}

async function handleShopBuy(interaction) {
    await interaction.deferReply({ flags: 64 });

    const code = interaction.options.getString('id').toUpperCase();

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const characterName = char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const charTier      = char.properties['Tier']?.formula?.number ?? 1;
    const currentRep     = char.properties['Reputation Points']?.number ?? 0;

    const entry = getBuyableEntry(code);
    if (!entry) return interaction.editReply({ content: `❌ No available item with code \`${code}\`.` });

    const tierMin = tierMinFor(entry.rarity);
    if (charTier < tierMin) {
        return interaction.editReply({ content: `❌ **${entry.name}** requires Tier ${tierMin}. Your character is Tier ${charTier}.` });
    }

    const currentGold = await getCharacterGold(char.id).catch(() => 0);
    if (currentGold < entry.price) {
        return interaction.editReply({ content: `❌ Not enough gold. **${entry.name}** costs **${formatCurrency(entry.price)}** but you only have **${formatCurrency(currentGold)}**.` });
    }
    if (entry.quantity <= 0) return interaction.editReply({ content: `❌ **${entry.name}** is out of stock.` });

    const discounts = availableDiscounts(currentRep, entry.rarity);

    if (discounts.length === 0) {
        return finalizePurchase(interaction, { char, characterName, code, entry, currentGold });
    }

    setPendingBuy(interaction.user.id, { char, characterName, code, entry, currentGold, currentRep, discounts });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shopbuy_discount_yes').setLabel('Use reputation for a discount').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('shopbuy_discount_no').setLabel('No, buy at full price').setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
        content: `**${entry.name}** — ${formatCurrency(entry.price)}.\nYou have **${currentRep} RP**, eligible for up to **${discounts[discounts.length - 1].discount}% off** on this item. Use reputation for a discount?`,
        components: [row],
    });
}

module.exports = {
    finalizePurchase,
    handleShopBuy,
};
