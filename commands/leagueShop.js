const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const {
    getActiveCharacter,
    adjustCharacterNumbersUnlocked,
    withPageLock,
    withTwoPageLocks,
    getOpenListings,
    getListingById,
    generateListingId,
    createListing,
    createInventoryItem,
    setItemStatus,
    getCharacterGold,
    updatePageProperty,
    getPageById,
    getCharacterInventory,
} = require('../utils/leagueNotion');
const {
    syncCatalogue,
    searchCatalogue,
    getCatalogueItemByCode,
    getCatalogueItemByName,
    getCatalogueMeta,
    defaultPriceFor,
} = require('../utils/5etoolsCatalogue');
const {
    tierMinFor,
    getShopEntry,
    getBuyableEntry,
    getAllStockedEntries,
    stockItem,
    unstockItem,
    restockItem,
    decrementStock,
} = require('../utils/shopFloor');
const { formatCurrency } = require('../utils/currency');
const { availableDiscounts } = require('../config/reputationDiscounts');
const { setPendingBuy } = require('../utils/shopBuySessions');
const { setPendingSell } = require('../utils/shopSellSessions');
const { sendAdminLog } = require('../utils/adminLog');

const PAGE_SIZE = 12;
const MARKETPLACE_TAX_RATE = 0.25;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rarityEmoji(rarity) {
    return { Common: '⚪', Uncommon: '🟢', Rare: '🔵', 'Very Rare': '🟣', Legendary: '🟠' }[rarity] ?? '⚫';
}

function buildShopEmbed(entries, page, totalPages, filters) {
    const start = page * PAGE_SIZE;
    const slice = entries.slice(start, start + PAGE_SIZE);

    const filterDesc = [
        filters.rarity ? `Rarity: ${filters.rarity}` : null,
        filters.sortBy ? `Sort: ${filters.sortBy}`   : null,
    ].filter(Boolean).join(' · ');

    const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🏪 Guild Shop')
        .setFooter({ text: `Page ${page + 1} of ${totalPages} · ${entries.length} item(s)${filterDesc ? ` · ${filterDesc}` : ''}` })
        .setTimestamp();

    if (slice.length === 0) {
        embed.setDescription('No items available.');
        return embed;
    }

    const rows = slice.map(e => {
        const name = e.name.padEnd(24).slice(0, 24);
        return `\`${e.code}\`  ${rarityEmoji(e.rarity)} ${name}  ${formatCurrency(e.price).padStart(12)}  ×${e.quantity}`;
    });

    const header  = `${'Code'.padEnd(6)}  ${'Item'.padEnd(26)}  ${'Price'.padStart(8)}  Stock`;
    const divider = '─'.repeat(54);
    embed.setDescription(`\`\`\`\n${header}\n${divider}\n${rows.join('\n')}\n\`\`\`\nUse \`/league shop buy <code>\` to purchase.`);
    return embed;
}

function buildMarketEmbed(listings, page, totalPages, filters) {
    const start = page * PAGE_SIZE;
    const slice = listings.slice(start, start + PAGE_SIZE);

    const filterDesc = [
        filters.rarity ? `Rarity: ${filters.rarity}` : null,
        filters.sortBy ? `Sort: ${filters.sortBy}`   : null,
    ].filter(Boolean).join(' · ');

    const embed = new EmbedBuilder()
        .setColor(0x1abc9c)
        .setTitle('🏬 Player Marketplace')
        .setFooter({ text: `Page ${page + 1} of ${totalPages} · ${listings.length} listing(s)${filterDesc ? ` · ${filterDesc}` : ''}` })
        .setTimestamp();

    if (slice.length === 0) {
        embed.setDescription('No listings available.');
        return embed;
    }

    const rows = slice.map(listing => {
        const p      = listing.properties;
        const id     = p['Listing ID']?.title?.[0]?.plain_text ?? '????';
        const item   = (listing._itemName ?? 'Unknown').padEnd(24);
        const rarity = listing._itemRarity ?? '—';
        const price  = p['Asking Price']?.number ?? 0;
        return `\`${id}\`  ${rarityEmoji(rarity)} ${item}  ${formatCurrency(price).padStart(10)}`;
    });

    const header  = `${'ID'.padEnd(6)}  ${'Item'.padEnd(26)}  ${'Price'.padStart(8)}`;
    const divider = '─'.repeat(46);
    embed.setDescription(`\`\`\`\n${header}\n${divider}\n${rows.join('\n')}\n\`\`\`\nUse \`/league marketplace buy <id>\` to purchase. A ${Math.round(MARKETPLACE_TAX_RATE * 100)}% tax on the item's value is deducted from the seller's proceeds on every sale.`);
    return embed;
}

// ─── /league shop browse ──────────────────────────────────────────────────────

async function handleShopBrowse(interaction) {
    await interaction.deferReply({ flags: 64 });

    const rarity = interaction.options.getString('rarity') ?? null;
    const sortBy = interaction.options.getString('sort')   ?? null;

    let entries = getAllStockedEntries({ availableOnly: true });
    if (rarity) entries = entries.filter(e => e.rarity === rarity);
    if (sortBy === 'price_asc')  entries.sort((a, b) => a.price - b.price);
    if (sortBy === 'price_desc') entries.sort((a, b) => b.price - a.price);
    if (sortBy === 'name')       entries.sort((a, b) => a.name.localeCompare(b.name));

    if (entries.length === 0) return interaction.editReply({ content: '🏪 No items match your filters.' });
    return require('../buttons/shopBrowse').sendPaged(interaction, 'shopbrowse', entries, { rarity, sortBy });
}

// ─── /league shop search ──────────────────────────────────────────────────────

async function handleShopSearch(interaction) {
    await interaction.deferReply({ flags: 64 });

    const query = interaction.options.getString('name');
    const catalogueMatches = searchCatalogue(query, { limit: 100 });

    const results = catalogueMatches
        .map(item => getBuyableEntry(item.code))
        .filter(entry => entry && entry.available);

    if (results.length === 0) {
        return interaction.editReply({ content: `🔎 No stocked items match \`${query}\`.` });
    }

    return require('../buttons/shopSearch').sendResults(interaction, query, results);
}

// ─── /league shop info ────────────────────────────────────────────────────────

async function handleShopInfo(interaction) {
    await interaction.deferReply({ flags: 64 });

    const code = interaction.options.getString('code');
    const stocked = getShopEntry(code);
    const catalogueItem = getCatalogueItemByCode(code);

    if (!catalogueItem) {
        return interaction.editReply({ content: `❌ No item found for \`${code}\`. Try \`/league shop search\`.` });
    }

    if (!stocked && catalogueItem.isVariantCombo) {
        const buyable = getBuyableEntry(code);
        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`${rarityEmoji(catalogueItem.rarity)} ${catalogueItem.name}`)
            .addFields(
                { name: 'Code',   value: `\`${catalogueItem.code}\``, inline: true },
                { name: 'Rarity', value: catalogueItem.rarity, inline: true },
                { name: 'Price',  value: `${formatCurrency(buyable.price)}`, inline: true },
            )
            .setDescription(catalogueItem.description?.slice(0, 500) || 'No description available.')
            .setFooter({ text: 'Magic variant — always available, use /league shop buy to purchase.' });
        return interaction.editReply({ embeds: [embed] });
    }

    const embed = stocked
        ? new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle(`${rarityEmoji(stocked.rarity)} ${stocked.name}`)
            .addFields(
                { name: 'Code',   value: `\`${stocked.code}\``, inline: true },
                { name: 'Rarity', value: stocked.rarity, inline: true },
                { name: 'Price',  value: `${formatCurrency(stocked.price)}`, inline: true },
                { name: 'Stock',  value: `${stocked.quantity}`, inline: true },
            )
            .setFooter({ text: 'Currently on the shop floor — use /league shop buy to purchase.' })
        : new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle(`${rarityEmoji(catalogueItem.rarity)} ${catalogueItem.name}`)
            .addFields(
                { name: 'Code',   value: `\`${catalogueItem.code}\``, inline: true },
                { name: 'Rarity', value: catalogueItem.rarity, inline: true },
                { name: 'Official Price', value: `${formatCurrency(catalogueItem.priceGp)}`, inline: true },
            )
            .setDescription(catalogueItem.description?.slice(0, 500) || 'No description available.')
            .setFooter({ text: 'Not currently on the shop floor.' });

    return interaction.editReply({ embeds: [embed] });
}

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
    try {
        goldBefore = await withPageLock(char.id, async () => {
            const gold = await getCharacterGold(char.id);
            if (gold < finalPrice) throw new Error('INSUFFICIENT_GOLD');

            const writes = [
                adjustCharacterNumbersUnlocked(char.id, { Gold: -finalPrice }),
                createInventoryItem({
                    itemName: entry.name,
                    type: entry.type,
                    rarity: entry.rarity,
                    itemValue: entry.price,
                    source: 'Shop Purchase',
                    characterPageId: char.id,
                    status: 'Owned',
                }),
            ];
            if (rpCost > 0) writes.push(adjustCharacterNumbersUnlocked(char.id, { 'Reputation Points': -rpCost }));
            await Promise.all(writes);

            return gold;
        });
    } catch (err) {
        if (err.message === 'INSUFFICIENT_GOLD') {
            return interaction.editReply({ content: `❌ Not enough gold. **${entry.name}** costs **${formatCurrency(finalPrice)}**.`, components: [] });
        }
        console.error('[league shop buy] Notion write error:', err);
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

// ─── /league shop sell ─────────────────────────────────────────────────────────

function priceItemForSale(item, labelForErrors) {
    const itemStatus = item.properties['Status']?.select?.name;
    if (itemStatus !== 'Owned') {
        return { error: `❌ ${labelForErrors} cannot be sold (current status: ${itemStatus}).` };
    }

    const itemName = item.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';
    let itemValue  = item.properties['Item Value']?.number ?? null;

    if (itemValue == null) {
        const catalogueItem = getCatalogueItemByName(itemName);
        if (catalogueItem) {
            itemValue = catalogueItem.priceGp ?? defaultPriceFor(catalogueItem.rarity);
        }
    }

    if (itemValue == null) {
        return { error: `❌ **${itemName}** has no value on file and cannot be sold. Contact an admin.` };
    }

    return {
        pageId: item.id,
        name: itemName,
        value: itemValue,
        sellPrice: itemValue / 2,
    };
}

async function handleShopSell(interaction) {
    await interaction.deferReply({ flags: 64 });

    const autoItemId  = interaction.options.getString('item');
    const legacyInput = interaction.options.getString('item_id');

    if (!autoItemId && !legacyInput) {
        return interaction.editReply({ content: '❌ Pick an item from the list, or use the legacy `item_id` field to sell multiple items at once.' });
    }
    if (autoItemId && legacyInput) {
        return interaction.editReply({ content: '❌ Use either the item picker or the legacy `item_id` field, not both.' });
    }

    const sellerChar = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!sellerChar) return interaction.editReply({ content: '❌ No active character found.' });

    const items = [];
    let usedLegacy = false;

    if (autoItemId) {
        let item;
        try {
            item = await getPageById(autoItemId);
        } catch (err) {
            console.error('[league shop sell] Notion error fetching item:', err);
            return interaction.editReply({ content: '❌ Could not find that item — please pick it again from the list.' });
        }

        const ownerId = item.properties['Character']?.relation?.[0]?.id ?? null;
        if (ownerId !== sellerChar.id) {
            return interaction.editReply({ content: '❌ That item does not belong to your active character. Please pick it again from the list.' });
        }

        const itemName = item.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const priced = priceItemForSale(item, `**${itemName}**`);
        if (priced.error) return interaction.editReply({ content: priced.error });
        items.push(priced);
    } else {
        usedLegacy = true;

        const itemIdInput = legacyInput.replace('#', '').trim();
        const rawIds = itemIdInput.split(',').map(s => s.trim()).filter(Boolean);

        const serials = [];
        for (const raw of rawIds) {
            const serial = parseInt(raw, 10);
            if (isNaN(serial) || serial < 1) {
                return interaction.editReply({ content: `❌ Invalid item ID \`${raw}\`. Use the \`#\` number(s) shown in \`/league inv\`, e.g. \`001\` or \`001,003\`.` });
            }
            serials.push(serial);
        }

        let inventory;
        try {
            inventory = await getCharacterInventory(sellerChar.id);
        } catch (err) {
            console.error('[league shop sell] Notion error:', err);
            return interaction.editReply({ content: '❌ Could not fetch your inventory. Please try again.' });
        }

        for (const serial of serials) {
            const item = inventory[serial - 1];
            if (!item) {
                return interaction.editReply({ content: `❌ No item at position \`#${String(serial).padStart(3, '0')}\` in your inventory.` });
            }

            const priced = priceItemForSale(item, `Item \`#${String(serial).padStart(3, '0')}\``);
            if (priced.error) return interaction.editReply({ content: priced.error });
            priced.serial = serial;
            items.push(priced);
        }

        const uniquePageIds = new Set(items.map(i => i.pageId));
        if (uniquePageIds.size !== items.length) {
            return interaction.editReply({ content: '❌ Duplicate item ID in your list.' });
        }
    }

    const totalPrice = items.reduce((sum, i) => sum + i.sellPrice, 0);

    setPendingSell(interaction.user.id, {
        char: sellerChar,
        characterName: sellerChar.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown',
        items,
        totalPrice,
    });

    const lines = items.map(i => i.serial != null
        ? `**${i.name}** (\`#${String(i.serial).padStart(3, '0')}\`) — ${formatCurrency(i.value)} → sells for **${formatCurrency(i.sellPrice)}**`
        : `**${i.name}** — ${formatCurrency(i.value)} → sells for **${formatCurrency(i.sellPrice)}**`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shopsell_confirm_yes').setLabel('Confirm sale').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('shopsell_confirm_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    const warning = usedLegacy
        ? '\n\n⚠️ You used the legacy positional method — this can fail or grab the wrong item if your inventory changed recently. Double-check the item(s) above before confirming.'
        : '';

    return interaction.editReply({
        content: `${lines.join('\n')}\n\nTotal payout: **${formatCurrency(totalPrice)}**.${warning} Confirm sale?`,
        components: [row],
    });
}

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
    return require('../buttons/shopBrowse').sendPaged(interaction, 'marketbrowse', listings, { rarity, sortBy });
}

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

// ─── /leagueadmin shop stock ───────────────────────────────────────────────────

async function handleAdminShopStock(interaction) {
    await interaction.deferReply({ flags: 64 });
    const code = interaction.options.getString('code');
    const quantity = interaction.options.getInteger('quantity');
    const price = interaction.options.getInteger('price');

    const result = stockItem(code, { quantity, price });
    if (!result) return interaction.editReply({ content: `❌ No catalogue item found for \`${code}\`. Try \`/leagueadmin catalogue sync\`.` });

    return interaction.editReply({ content: `✅ Stocked **${result.name}** (\`${result.code}\`) — ${result.quantity} @ ${formatCurrency(result.price)}.` });
}

// ─── /leagueadmin shop stockall — bulk-stocks the whole catalogue (or a rarity slice) ──

async function handleAdminShopStockAll(interaction) {
    await interaction.deferReply({ flags: 64 });
    const rarityFilter = interaction.options.getString('rarity');
    const { items } = require('../utils/5etoolsCatalogue').loadCatalogue();
    const list = rarityFilter ? items.filter(i => i.rarity === rarityFilter) : items;

    if (!list.length) return interaction.editReply({ content: '❌ Catalogue is empty — run `/leagueadmin catalogue sync` first.' });

    let ok = 0;
    for (const c of list) {
        if (stockItem(c.code)) ok++;
        if (ok % 50 === 0) console.log(`[shop stockall] ${ok}/${list.length}`);
    }
    return interaction.editReply({ content: `✅ Bulk stock complete — **${ok}** stocked${rarityFilter ? ` (rarity: ${rarityFilter})` : ''}.` });
}

// ─── /leagueadmin shop unstock ─────────────────────────────────────────────────

async function handleAdminShopUnstock(interaction) {
    await interaction.deferReply({ flags: 64 });
    const code = interaction.options.getString('code').toUpperCase();
    const item = unstockItem(code);
    if (!item) return interaction.editReply({ content: `❌ No shop item found with code \`${code}\`.` });
    return interaction.editReply({ content: `✅ \`${code}\` removed from the shop floor.` });
}

// ─── /leagueadmin shop restock ─────────────────────────────────────────────────

async function handleAdminShopRestock(interaction) {
    await interaction.deferReply({ flags: 64 });
    const code = interaction.options.getString('code').toUpperCase();
    const item = restockItem(code);
    if (!item) return interaction.editReply({ content: `❌ No shop item found with code \`${code}\`.` });
    return interaction.editReply({ content: `✅ \`${code}\` manually restocked to ${item.quantity}.` });
}

// ─── /leagueadmin catalogue sync ───────────────────────────────────────────────

async function handleAdminCatalogueSync(interaction) {
    await interaction.deferReply({ flags: 0 });

    try {
        const { count, syncedAt } = await syncCatalogue();
        return interaction.editReply({
            content: `✅ Catalogue synced from Open5e (\`srd-2024\`) — **${count}** items loaded at <t:${Math.floor(new Date(syncedAt).getTime() / 1000)}:f>.`,
        });
    } catch (err) {
        console.error('[leagueadmin catalogue sync] Open5e error:', err);
        const meta = getCatalogueMeta();
        return interaction.editReply({
            content: `❌ Sync failed: ${err.message}. Local catalogue still has **${meta.count}** items from the last successful sync.`,
        });
    }
}

// ─── Routers ──────────────────────────────────────────────────────────────────

async function leagueShop(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'browse': 	return handleShopBrowse(interaction);
        case 'search': 	return handleShopSearch(interaction);
        case 'info': 	return handleShopInfo(interaction);
        case 'buy': 	return handleShopBuy(interaction);
        case 'sell':	return handleShopSell(interaction);
    }
}

async function leagueAdminShop(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'stock':   	return handleAdminShopStock(interaction);
        case 'unstock': 	return handleAdminShopUnstock(interaction);
        case 'stockall':	return handleAdminShopStockAll(interaction);
        case 'restock': 	return handleAdminShopRestock(interaction);
    }
}

async function leagueAdminCatalogue(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'sync': return handleAdminCatalogueSync(interaction);
    }
}

async function leagueMarketplace(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'browse':      return handleMarketplaceBrowse(interaction);
        case 'buy':         return handleMarketplaceBuy(interaction);
        case 'list':        return handleMarketplaceList(interaction);
        case 'unlist':      return handleMarketplaceUnlist(interaction);
    }
}

module.exports = { leagueShop, leagueMarketplace, leagueAdminShop, leagueAdminCatalogue, buildShopEmbed, buildMarketEmbed, finalizePurchase };
