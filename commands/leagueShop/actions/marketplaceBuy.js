const { EmbedBuilder } = require('discord.js');
const {
    getActiveCharacter,
    adjustCharacterNumbersUnlocked,
    withTwoPageLocks,
    getListingById,
    getCharacterGold,
    updatePageProperty,
    getPageById,
} = require('../../../utils/leagueNotion');
const { formatCurrency } = require('../../../utils/currency');
const { sendAdminLog } = require('../../../utils/adminLog');
const { MARKETPLACE_TAX_RATE } = require('../constants');

// ─── /league marketplace buy ──────────────────────────────────────────────────

async function handleMarketplaceBuy(interaction) {
    await interaction.deferReply({ flags: 64 });

    const listingId = interaction.options.getString('id').toUpperCase();

    const buyerChar = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!buyerChar) return interaction.editReply({ content: '❌ No active character found.' });

    let listing;
    try {
        listing = await getListingById(listingId);
    } catch (err) {
        console.error('[league marketplace buy] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the marketplace. Please try again.' });
    }

    if (!listing) return interaction.editReply({ content: `❌ No active listing with ID \`${listingId}\`.` });

    const p            = listing.properties;
    const askingPrice  = p['Asking Price']?.number ?? 0;
    const sellerPageId = p['Seller']?.relation?.[0]?.id ?? null;
    const itemPageId   = p['Item']?.relation?.[0]?.id ?? null;

    if (!sellerPageId || !itemPageId) {
        return interaction.editReply({ content: '❌ Listing is malformed. Contact an admin.' });
    }

    if (sellerPageId === buyerChar.id) {
        return interaction.editReply({ content: '❌ You cannot buy your own listing.' });
    }

    // Enrich item and seller data
    let itemName = 'Unknown', itemRarity = '—', itemValue = null;
    let sellerCharName = 'Unknown', sellerDiscordId = null;

    try {
        const [itemPage, sellerPage] = await Promise.all([
            getPageById(itemPageId),
            getPageById(sellerPageId),
        ]);
        itemName        = itemPage.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';
        itemRarity      = itemPage.properties['Rarity']?.select?.name ?? '—';
        itemValue       = itemPage.properties['Item Value']?.number ?? null;
        sellerCharName  = sellerPage.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        sellerDiscordId = sellerPage.properties['Discord ID']?.rich_text?.[0]?.plain_text ?? null;
    } catch (err) {
        console.warn('[marketplace buy] Could not fetch item/seller details:', err.message);
    }

    const buyerName  = buyerChar.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    const taxBase      = itemValue ?? askingPrice;
    const taxAmount     = Math.round(taxBase * MARKETPLACE_TAX_RATE * 100) / 100;
    const sellerPayout  = Math.max(0, askingPrice - taxAmount);

    let buyerGoldBefore, sellerGoldBefore;
    let stage = 'none'; // none -> buyer_debited -> seller_credited -> complete

    try {
        await withTwoPageLocks(buyerChar.id, sellerPageId, async () => {
            buyerGoldBefore = await getCharacterGold(buyerChar.id);
            if (buyerGoldBefore < askingPrice) throw new Error('INSUFFICIENT_GOLD');
            sellerGoldBefore = await getCharacterGold(sellerPageId);

            await adjustCharacterNumbersUnlocked(buyerChar.id, { Gold: -askingPrice });
            stage = 'buyer_debited';

            await adjustCharacterNumbersUnlocked(sellerPageId, { Gold: sellerPayout });
            stage = 'seller_credited';

            await Promise.all([
                updatePageProperty(itemPageId, {
                    'Character': { relation: [{ id: buyerChar.id }] },
                    'Status':    { select: { name: 'Owned' } },
                }),
                updatePageProperty(listing.id, {
                    'Status': { select: { name: 'Sold' } },
                }),
            ]);
            stage = 'complete';
        });
    } catch (err) {
        if (err.message === 'INSUFFICIENT_GOLD') {
            return interaction.editReply({
                content: `❌ Not enough gold. This listing costs **${formatCurrency(askingPrice)}** but you only have **${formatCurrency(buyerGoldBefore ?? 0)}**.`,
            });
        }

        console.error('[league marketplace buy] Notion write error:', err, { stage });

        if (stage !== 'none') {
            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Marketplace Purchase Failed Mid-Transaction — Needs Reconciliation')
                .setDescription(`Failed at stage \`${stage}\`. Error: ${err.message}`)
                .addFields(
                    { name: 'Listing ID',   value: `\`${listingId}\``, inline: true },
                    { name: 'Item',         value: itemName,           inline: true },
                    { name: 'Asking Price', value: `${formatCurrency(askingPrice)}`, inline: true },
                    { name: 'Buyer',        value: `${buyerName} (\`${buyerChar.id}\`, <@${interaction.user.id}>)`, inline: false },
                    { name: 'Buyer Gold Before',  value: `${formatCurrency(buyerGoldBefore ?? 0)}`, inline: true },
                    { name: 'Buyer Gold Expected After', value: `${formatCurrency((buyerGoldBefore ?? 0) - askingPrice)}`, inline: true },
                    { name: '\u200b', value: '\u200b', inline: true },
                    { name: 'Seller',       value: `${sellerCharName} (\`${sellerPageId}\`)`, inline: false },
                    { name: 'Seller Gold Before', value: `${formatCurrency(sellerGoldBefore ?? 0)}`, inline: true },
                    { name: 'Seller Gold Expected After', value: `${formatCurrency((sellerGoldBefore ?? 0) + sellerPayout)}`, inline: true },
                    { name: '\u200b', value: '\u200b', inline: true },
                    { name: 'Item Page ID',    value: `\`${itemPageId}\``, inline: true },
                    { name: 'Was Item/Listing Flipped?', value: stage === 'complete' ? 'Yes' : 'No — still needs manual flip to Owned/Sold', inline: true },
                )
                .setTimestamp()
            );

            return interaction.editReply({
                content: '⚠️ Your purchase partially completed and an admin has been notified to reconcile it. Please do not retry until it\'s resolved — contact an admin.',
            });
        }

        return interaction.editReply({ content: '❌ Purchase failed. Please try again.' });
    }

    // DM seller
    if (sellerDiscordId) {
        try {
            const sellerUser = await interaction.client.users.fetch(sellerDiscordId);
            await sellerUser.send({
                embeds: [new EmbedBuilder()
                    .setColor(0x1abc9c)
                    .setTitle('🏬 Your Item Sold!')
                    .setDescription(`**${itemName}** was purchased from your marketplace listing.`)
                    .addFields(
                        { name: 'Sale Price', value: `${formatCurrency(askingPrice)}`, inline: true },
                        { name: `Tax (${Math.round(MARKETPLACE_TAX_RATE * 100)}%)`, value: `-${formatCurrency(taxAmount)}`, inline: true },
                        { name: 'You Received', value: `${formatCurrency(sellerPayout)}`, inline: true },
                        { name: 'Buyer',      value: buyerName,            inline: true },
                    )
                    .setTimestamp()
                ],
            });
        } catch (err) {
            console.warn('[marketplace buy] Could not DM seller:', err.message);
        }
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x1abc9c)
        .setTitle('🏬 Marketplace Sale')
        .addFields(
            { name: 'Item',       value: itemName,                                   inline: true },
            { name: 'Rarity',     value: itemRarity,                                 inline: true },
            { name: 'Price',      value: `${formatCurrency(askingPrice)}`,                        inline: true },
            { name: 'Buyer',      value: `${buyerName} (<@${interaction.user.id}>)`, inline: true },
            { name: 'Seller',     value: sellerCharName,                             inline: true },
            { name: '\u200b',     value: '\u200b',                                   inline: true },
            { name: `Tax (${Math.round(MARKETPLACE_TAX_RATE * 100)}%)`, value: `${formatCurrency(taxAmount)}`, inline: true },
            { name: 'Seller Received', value: `${formatCurrency(sellerPayout)}`,     inline: true },
            { name: '\u200b',     value: '\u200b',                                   inline: true },
            { name: 'Listing ID', value: `\`${listingId}\``,                         inline: false },
        )
        .setTimestamp()
    );

    return interaction.editReply({
        content: `✅ Purchased **${itemName}** for **${formatCurrency(askingPrice)}**. New balance: **${formatCurrency(buyerGoldBefore - askingPrice)}**.`,
    });
}

module.exports = {
    handleMarketplaceBuy,
};
