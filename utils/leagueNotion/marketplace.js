const { randomBytes } = require('crypto');
const { todayISTDateString } = require('../dateFormat');
const { notion, DB, withPageLock, queryAllPages } = require('./core');

// ─── guild_shop ──────────────────────────────────────────────────────────────
async function getShopItemByCatalogueCode(code) {
    const response = await notion.dataSources.query({
        data_source_id: DB.shop,
        filter: { property: 'Open5e Code', rich_text: { equals: code.toLowerCase() } },
        page_size: 1,
    });
    return response.results[0] ?? null;
}

async function getAllShopItems() {
    return queryAllPages(DB.shop);
}

// ─── player_marketplace ──────────────────────────────────────────────────────

async function getOpenListings({ rarity, sortBy } = {}) {
    const filters = [{ property: 'Status', select: { equals: 'Open' } }];
    if (rarity) filters.push({ property: 'Rarity', select: { equals: rarity } });

    const results = await queryAllPages(DB.marketplace, {
        filter: { and: filters },
        sorts: [{ property: sortBy ?? 'Listed Date', direction: 'descending' }],
    });

    const enriched = await Promise.all(results.map(async listing => {
        const itemPageId = listing.properties['Item']?.relation?.[0]?.id ?? null;
        if (!itemPageId) return listing;
        try {
            const itemPage = await notion.pages.retrieve({ page_id: itemPageId });
            listing._itemName   = itemPage.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';
            listing._itemRarity = itemPage.properties['Rarity']?.select?.name ?? '—';
            listing._itemType   = itemPage.properties['Type']?.select?.name ?? '—';
        } catch {
            listing._itemName   = 'Unknown';
            listing._itemRarity = '—';
            listing._itemType   = '—';
        }
        return listing;
    }));

    return enriched;
}

async function getListingById(listingId) {
    const response = await notion.dataSources.query({
        data_source_id: DB.marketplace,
        filter: {
            and: [
                { property: 'Listing ID', title: { equals: listingId.toUpperCase() } },
                { property: 'Status',     select: { equals: 'Open' } },
            ],
        },
        page_size: 1,
    });
    return response.results[0] ?? null;
}

async function createListing(opts) {
  const { listingId, sellerPageId, itemPageId, askingPrice, notes } = opts;

  const properties = {
    'Listing ID': {
      title: [{ text: { content: listingId } }],
    },
    'Seller': {
      relation: [{ id: sellerPageId }],
    },
    'Item': {
      relation: [{ id: itemPageId }],
    },
    'Asking Price': { number: askingPrice },
    'Status': {
      select: { name: 'Open' },
    },
    'Listed Date': {
      date: { start: todayISTDateString() },
    },
  };

  if (notes) properties['Notes'] = { rich_text: [{ text: { content: notes } }] };

  return notion.pages.create({
    parent: { data_source_id: DB.marketplace },
    properties,
  });
}

async function generateListingId() {
    let id, exists;
    do {
        id = randomBytes(2).toString('hex').toUpperCase();
        exists = await getListingById(id).catch(() => null);
    } while (exists);
    return id;
}

async function createListingWithUniqueId(opts) {
    return withPageLock('__lock:marketplace-listing-id', async () => {
        const listingId = await generateListingId();
        return createListing({ ...opts, listingId });
    });
}

// ─── league_trades ───────────────────────────────────────────────────────────

async function createTrade(opts) {
  const {
    tradeId,
    sellerPageId,
    buyerPageId,
    itemPageIds,
    agreedPriceTotal,
    notes,
  } = opts;

  const properties = {
    'Trade ID': {
      title: [{ text: { content: tradeId } }],
    },
    'Seller': {
      relation: [{ id: sellerPageId }],
    },
    'Buyer': {
      relation: [{ id: buyerPageId }],
    },
    'Items': {
      relation: itemPageIds.map((id) => ({ id })),
    },
    'Agreed Price Total': { number: agreedPriceTotal },
    'Status': {
      select: { name: 'Pending' },
    },
    'Date': {
      date: { start: todayISTDateString() },
    },
  };

  if (notes) properties['Notes'] = { rich_text: [{ text: { content: notes } }] };

  return notion.pages.create({
    parent: { data_source_id: DB.trades },
    properties,
  });
}

module.exports = {
    getOpenListings,
    getListingById,
    createListing,
    generateListingId,
    createListingWithUniqueId,
    createTrade,
};
