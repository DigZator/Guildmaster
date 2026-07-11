const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const {
    getActiveCharacter,
    adjustCharacterNumber,
    getOpenListings,
    getListingById,
    generateListingId,
    createListing,
    createInventoryItem,
    setItemStatus,
    getCharacterGold,
    setCharacterGold,
    updatePageProperty,
    getPageById,
    getCharacterInventory,
} = require('../utils/leagueNotion');
const {
    syncCatalogue,
    searchCatalogue,
    getCatalogueItemByCode,
    getCatalogueMeta,
} = require('../utils/5etoolsCatalogue');
const {
    tierMinFor,
    getShopEntry,
    getAllStockedEntries,
    stockItem,
    unstockItem,
    restockItem,
    decrementStock,
} = require('../utils/shopFloor');
const { formatCurrency } = require('../utils/currency');
const { availableDiscounts } = require('../config/reputationDiscounts');
const { setPendingBuy } = require('../utils/shopBuySessions');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

const PAGE_SIZE = 12;
const MARKETPLACE_TAX_RATE = 0.25; // 25% — deducted from the seller's proceeds, removed from the economy (sink)

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendAdminLog(guild, embed) {
    const channel = guild.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
    if (channel) await channel.send({ embeds: [embed] });
    else console.warn('[leagueShop] LEAGUE_ADMIN_CHANNEL_ID not found in cache.');
}

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
        .map(item => getShopEntry(item.code))
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

async function finalizePurchase(interaction, { char, characterName, code, entry, currentGold, discount = 0, rpCost = 0, currentRep = 0 }) {
    const finalPrice = Math.max(0, Math.round(entry.price * (1 - discount / 100)));

    if (currentGold < finalPrice) {
        return interaction.editReply({ content: `❌ Not enough gold. **${entry.name}** costs **${formatCurrency(finalPrice)}** but you only have **${formatCurrency(currentGold)}**.`, components: [] });
    }
    if (rpCost > 0 && currentRep < rpCost) {
        return interaction.editReply({ content: `❌ Not enough reputation for that discount anymore. You need **${rpCost} RP** but have **${currentRep}**.`, components: [] });
    }

    const updated = decrementStock(code);
    if (!updated) return interaction.editReply({ content: `❌ **${entry.name}** is out of stock.`, components: [] });

    try {
        const writes = [
            setCharacterGold(char.id, currentGold - finalPrice),
            createInventoryItem({
                itemName: entry.name,
                type: entry.type,
                rarity: entry.rarity,
                source: 'Shop Purchase',
                characterPageId: char.id,
                status: 'Owned',
            }),
        ];
        if (rpCost > 0) writes.push(adjustCharacterNumber(char.id, 'Reputation Points', -rpCost));
        await Promise.all(writes);
    } catch (err) {
        console.error('[league shop buy] Notion write error:', err);
        return interaction.editReply({ content: '❌ Purchase failed. Please try again.', components: [] });
    }

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

    const entry = getShopEntry(code);
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
        content: `**${entry.name}** — ${formatCurrency(entry.price)} gp.\nYou have **${currentRep} RP**, eligible for up to **${discounts[discounts.length - 1].discount}% off** on this item. Use reputation for a discount?`,
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

    const buyerGold = await getCharacterGold(buyerChar.id).catch(() => 0);
    if (buyerGold < askingPrice) {
        return interaction.editReply({
            content: `❌ Not enough gold. This listing costs **${formatCurrency(askingPrice)}** but you only have **${formatCurrency(buyerGold)}**.`,
        });
    }

    const sellerGold = await getCharacterGold(sellerPageId).catch(() => 0);
    const buyerName  = buyerChar.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    const taxBase      = itemValue ?? askingPrice;
    const taxAmount     = Math.round(taxBase * MARKETPLACE_TAX_RATE * 100) / 100;
    const sellerPayout  = Math.max(0, askingPrice - taxAmount);

    try {
        await Promise.all([
            setCharacterGold(buyerChar.id, buyerGold - askingPrice),
            setCharacterGold(sellerPageId, sellerGold + sellerPayout),
            updatePageProperty(itemPageId, {
                'Character': { relation: [{ id: buyerChar.id }] },
                'Status':    { select: { name: 'Owned' } },
            }),
            updatePageProperty(listing.id, {
                'Status': { select: { name: 'Sold' } },
            }),
        ]);
    } catch (err) {
        console.error('[league marketplace buy] Notion write error:', err);
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
        content: `✅ Purchased **${itemName}** for **${formatCurrency(askingPrice)}**. New balance: **${formatCurrency(buyerGold - askingPrice)}**.`,
    });
}

// ─── /league marketplace list ─────────────────────────────────────────────────

async function handleMarketplaceList(interaction) {
    await interaction.deferReply({ flags: 64 });

    const itemIdInput = interaction.options.getString('item_id').replace('#', '').trim();
    const serial      = parseInt(itemIdInput, 10);
    const askingPrice = interaction.options.getInteger('price');

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    if (isNaN(serial) || serial < 1) {
        return interaction.editReply({ content: '❌ Invalid item ID. Use the `#` number shown in `/league inv`, e.g. `001`.' });
    }

    let inventory;
    try {
        inventory = await getCharacterInventory(char.id);
    } catch (err) {
        console.error('[league marketplace list] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not fetch your inventory. Please try again.' });
    }

    const item = inventory[serial - 1]; // serial is 1-based, array is 0-based
    if (!item) return interaction.editReply({ content: `❌ No item at position \`#${String(serial).padStart(3, '0')}\` in your inventory.` });

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

    try {
        await Promise.all([
            createListing({ listingId, sellerPageId: char.id, itemPageId: item.id, askingPrice }),
            setItemStatus(item.id, 'Marketplace'),
        ]);
    } catch (err) {
        console.error('[league marketplace list] Notion write error:', err);
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

    try {
        await Promise.all([
            setItemStatus(itemPageId, 'Owned'),
            updatePageProperty(listing.id, { 'Status': { select: { name: 'Cancelled' } } }),
        ]);
    } catch (err) {
        console.error('[league marketplace unlist] Notion write error:', err);
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
        case 'browse': return handleShopBrowse(interaction);
        case 'search': return handleShopSearch(interaction);
        case 'info':   return handleShopInfo(interaction);
        case 'buy':    return handleShopBuy(interaction);
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
