const { EmbedBuilder } = require('discord.js');
const {
    getActiveCharacter,
    getOpenListings,
    getListingById,
    generateListingId,
    createListing,
    setItemStatus,
    updatePageProperty,
    getPageById,
} = require('../../../utils/leagueNotion');
const { formatCurrency } = require('../../../utils/currency');
const { sendAdminLog } = require('../../../utils/adminLog');

// ─── /league marketplace browse ───────────────────────────────────────────────

async function handleMarketplaceBrowse(interaction) {
    await interaction.deferReply({ flags: 64 });

    const rarity = interaction.options.getString('rarity') ?? null;
    const sortBy = interaction.options.getString('sort')   ?? null;

    let listings;
    try {
        listings = await getOpenListings({ rarity, sortBy });
    } catch (err) {
        console.error('[league marketplace browse] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the marketplace. Please try again.' });
    }

    if (listings.length === 0) return interaction.editReply({ content: '🏬 No listings match your filters.' });
    return require('../../../buttons/shopBrowse').sendPaged(interaction, 'marketbrowse', listings, { rarity, sortBy });
}

// ─── /league marketplace list ─────────────────────────────────────────────────

async function handleMarketplaceList(interaction) {
    await interaction.deferReply({ flags: 64 });

    const itemPageId  = interaction.options.getString('item_id');
    const askingPrice = interaction.options.getInteger('price');

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    let item;
    try {
        item = await getPageById(itemPageId);
    } catch (err) {
        console.error('[league marketplace list] Notion error fetching item:', err);
        return interaction.editReply({ content: '❌ Could not find that item — please pick it again from the list.' });
    }

    const ownerId = item.properties['Character']?.relation?.[0]?.id ?? null;
    if (ownerId !== char.id) {
        return interaction.editReply({ content: '❌ That item does not belong to your active character. Please pick it again from the list.' });
    }

    const itemStatus = item.properties['Status']?.select?.name;
    if (itemStatus !== 'Owned') {
        return interaction.editReply({ content: `❌ This item cannot be listed (current status: ${itemStatus}).` });
    }

    const itemName = item.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';

    let listingId;
    try {
        listingId = await generateListingId();
    } catch (err) {
        console.error('[league marketplace list] ID generation error:', err);
        return interaction.editReply({ content: '❌ Failed to generate listing ID. Please try again.' });
    }

    let stage = 'none'; // none -> item_reserved -> complete
    try {
        await setItemStatus(item.id, 'Marketplace');
        stage = 'item_reserved';

        await createListing({ listingId, sellerPageId: char.id, itemPageId: item.id, askingPrice });
        stage = 'complete';
    } catch (err) {
        console.error('[league marketplace list] Notion write error:', err, { stage });

        if (stage === 'item_reserved') {
            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Marketplace Listing Failed Mid-Creation — Needs Reconciliation')
                .setDescription(`Item was flipped to \`Marketplace\` status but listing creation failed. Error: ${err.message}`)
                .addFields(
                    { name: 'Item',         value: itemName,                          inline: true },
                    { name: 'Item Page ID', value: `\`${item.id}\``,                  inline: true },
                    { name: 'Intended Listing ID', value: `\`${listingId}\``,         inline: true },
                    { name: 'Seller',       value: `${char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown'} (\`${char.id}\`, <@${interaction.user.id}>)`, inline: false },
                    { name: 'Asking Price', value: `${formatCurrency(askingPrice)}`,  inline: true },
                )
                .setTimestamp()
            );

            return interaction.editReply({
                content: '⚠️ Listing failed partway through and an admin has been notified. Your item is temporarily unavailable to sell/list until it\'s manually fixed — please don\'t retry until then.',
            });
        }

        return interaction.editReply({ content: '❌ Failed to create listing. Please try again.' });
    }

    return interaction.editReply({
        content: `✅ Listed **${itemName}** for **${formatCurrency(askingPrice)}**. Listing ID: \`${listingId}\``,
    });
}

// ─── /league marketplace unlist ───────────────────────────────────────────────

async function handleMarketplaceUnlist(interaction) {
    await interaction.deferReply({ flags: 64 });

    const listingId = interaction.options.getString('id').toUpperCase();

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    let listing;
    try {
        listing = await getListingById(listingId);
    } catch (err) {
        console.error('[league marketplace unlist] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the marketplace. Please try again.' });
    }

    if (!listing) return interaction.editReply({ content: `❌ No active listing with ID \`${listingId}\`.` });

    const sellerPageId = listing.properties['Seller']?.relation?.[0]?.id ?? null;
    if (sellerPageId !== char.id) {
        return interaction.editReply({ content: '❌ You can only unlist your own listings.' });
    }

    const itemPageId = listing.properties['Item']?.relation?.[0]?.id ?? null;

    let stage = 'none'; // none -> listing_cancelled -> complete
    try {
        await updatePageProperty(listing.id, { 'Status': { select: { name: 'Cancelled' } } });
        stage = 'listing_cancelled';

        await setItemStatus(itemPageId, 'Owned');
        stage = 'complete';
    } catch (err) {
        console.error('[league marketplace unlist] Notion write error:', err, { stage });

        if (stage === 'listing_cancelled') {
            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Marketplace Unlist Failed Mid-Update — Needs Reconciliation')
                .setDescription(`Listing was cancelled but the item's status was not returned to \`Owned\`. Error: ${err.message}`)
                .addFields(
                    { name: 'Listing ID',   value: `\`${listingId}\``, inline: true },
                    { name: 'Item Page ID', value: `\`${itemPageId}\``, inline: true },
                    { name: 'Seller',       value: `${char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown'} (\`${char.id}\`, <@${interaction.user.id}>)`, inline: false },
                )
                .setTimestamp()
            );

            return interaction.editReply({
                content: '⚠️ Unlisting failed partway through and an admin has been notified. The listing is cancelled, but your item may still show as unavailable until it\'s manually fixed.',
            });
        }

        return interaction.editReply({ content: '❌ Failed to unlist. Please try again.' });
    }

    return interaction.editReply({
        content: `✅ Listing \`${listingId}\` removed. Item returned to your inventory.`,
    });
}

module.exports = {
    handleMarketplaceBrowse,
    handleMarketplaceList,
    handleMarketplaceUnlist,
};
