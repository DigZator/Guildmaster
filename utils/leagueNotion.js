const { Client } = require('@notionhq/client');
const { randomBytes } = require('crypto');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB = {
  characters:  process.env.LEAGUE_CHARACTERS_DB_ID,
  inventory:   process.env.LEAGUE_INVENTORY_DB_ID,
  questLog:    process.env.LEAGUE_QUEST_LOG_DB_ID,
  downtime:    process.env.LEAGUE_DOWNTIME_DB_ID,
  trades:      process.env.LEAGUE_TRADES_DB_ID,
  shop:        process.env.GUILD_SHOP_DB_ID,
  marketplace: process.env.PLAYER_MARKETPLACE_DB_ID,
};

// ─── per-page lock ────────────────────────────────────────────────

const pageLocks = new Map(); // pageId -> Promise chain tail

function withPageLock(pageId, fn) {
	const previous = pageLocks.get(pageId) ?? Promise.resolve();
	const run = previous.then(fn, fn); // run fn regardless of prior success/failure
	const tail = run.catch(() => {});
	pageLocks.set(pageId, tail);
	tail.finally(() => {
		if (pageLocks.get(pageId) === tail) pageLocks.delete(pageId);
	});
	return run;
}

// ─── helper ───────────────────────────────────────────────────────

async function updatePageProperty(pageId, properties) {
	return await notion.pages.update({
		page_id: pageId,
		properties,
	});
}

async function getCharacterGold(characterId) {
	const page = await notion.pages.retrieve({ page_id: characterId});
	return page.properties['Gold']?.number ?? 0;
}

async function setCharacterGold(characterId, amount) {
	return await updatePageProperty(characterId, {
		'Gold': { number:amount },
	});
}

async function getPageById(pageId) {
    return notion.pages.retrieve({ page_id: pageId });
}

// ─── league_characters ───────────────────────────────────────────────────────

async function getActiveCharacter(discordId) {
  const response = await notion.dataSources.query({
    data_source_id: DB.characters,
    filter: {
      and: [
        {
          property: 'Discord ID',
          rich_text: { equals: discordId },
        },
        {
          property: 'Status',
          select: { equals: 'Active' },
        },
      ],
    },
    page_size: 1,
  });

  return response.results[0] ?? null;
}

async function getCharactersByDiscordId(discordId) {
  const response = await notion.dataSources.query({
    data_source_id: DB.characters,
    filter: {
      property: 'Discord ID',
      rich_text: { equals: discordId },
    },
  });

  return response.results;
}

async function searchCharactersByName(nameQuery) {
  const response = await notion.dataSources.query({
    data_source_id: DB.characters,
    filter: {
      property: 'Character Name',
      title: { contains: nameQuery },
    },
    page_size: 25,
  });

  return response.results;
}

const LEADERBOARD_SORT_FIELDS = {
  level:      'Level',
  gold:       'Gold',
  reputation: 'Reputation Points',
  milestones: 'Milestones',
};

async function queryLeaderboard({ sortBy = 'level', order = 'descending', className = null, species = null, status = null } = {}) {
  const sortProperty = LEADERBOARD_SORT_FIELDS[sortBy] ?? 'Level';

  const filters = [];
  if (className) filters.push({ property: 'Class', rich_text: { contains: className } });
  if (species)   filters.push({ property: 'Species', rich_text: { contains: species } });
  if (status)    filters.push({ property: 'Status', select: { equals: status } });

  const response = await notion.dataSources.query({
    data_source_id: DB.characters,
    ...(filters.length > 0 ? { filter: filters.length === 1 ? filters[0] : { and: filters } } : {}),
    sorts: [{ property: sortProperty, direction: order }],
    page_size: 25,
  });

  return response.results;
}

async function createCharacter(opts) {
  const {
    characterName,
    classLevels,
    species,
    background,
    discordId,
    discordUsername,
    forumThreadId,
  } = opts;

  const page = await notion.pages.create({
    parent: { data_source_id: DB.characters },
    properties: {
      'Character Name': {
        title: [{ text: { content: characterName } }],
      },
      'Discord ID': {
        rich_text: [{ text: { content: discordId } }],
      },
      'Username': {
        rich_text: [{ text: { content: discordUsername } }],
      },
      'Class': {
        rich_text: [{ text: { content: classLevels } }],
      },
      'Species': {
        rich_text: [{ text: { content: species } }],
      },
      'Background': {
        rich_text: [{ text: { content: background } }],
      },
      'Level': {
        number: 1,
      },
      'Milestones': {
        number: 0,
      },
      'Gold': {
        number: 0,
      },
      'Reputation Points': {
        number: 0,
      },
      'Downtime Days': {
        number: 0,
      },
      'Status': {
        select: { name: 'Active' },
      },
      'Date Created': {
        date: { start: new Date().toISOString().split('T')[0] },
      },
      'Forum Thread Id': {
        rich_text: [{ text: { content: forumThreadId } }],
      },
    },
  });

  return page;
}

async function setCharacterStatus(pageId, status) {
  return notion.pages.update({
    page_id: pageId,
    properties: {
      'Status': { select: { name: status } },
    },
  });
}

async function adjustCharacterNumber(pageId, field, delta) {
  return withPageLock(pageId, () => adjustCharacterNumbersUnlocked(pageId, { [field]: delta }));
}

async function adjustCharacterNumbers(pageId, deltas) {
  return withPageLock(pageId, () => adjustCharacterNumbersUnlocked(pageId, deltas));
}


async function adjustCharacterNumbersUnlocked(pageId, deltas) {
  const page = await notion.pages.retrieve({ page_id: pageId });
  const properties = {};
  for (const [field, delta] of Object.entries(deltas)) {
    const current = page.properties[field]?.number ?? 0;
    properties[field] = { number: current + delta };
  }
  return notion.pages.update({ page_id: pageId, properties });
}

async function setCharacterLevel(pageId, level) {
  return notion.pages.update({
    page_id: pageId,
    properties: {
      'Level': { number: level },
    },
  });
}

async function updateCharacterArt(pageId, artURL) {
    return await updatePageProperty(pageId, {
        'CharArtURL': { url: artURL },
    });
}


// ─── league_inventory ────────────────────────────────────────────────────────

async function createInventoryItem(opts) {
  const {
    itemName,
    characterPageId,
    rarity,
    type,
    subtype,
    source,
    sourceQuestId,
    itemValue,
    status,
    notes,
  } = opts;

  const properties = {
    'Item Name': {
      title: [{ text: { content: itemName } }],
    },
    'Rarity': {
      select: { name: rarity },
    },
    'Type': {
      select: { name: type },
    },
    'Date Acquired': {
      date: { start: new Date().toISOString().split('T')[0] },
    },
  };

  if (subtype) 				properties['Subtype'] 		= { select: { name: subtype } };
  if (sourceQuestId) 		properties['Source Quest'] 	= { relation: [{ id: sourceQuestId }] };
  if (itemValue != null) 	properties['Item Value'] 	= { number: itemValue };
  if (characterPageId) 		properties['Character'] 	= { relation: [{ id: characterPageId }] };
  if (source)          		properties['Source'] 		= { select: { name: source } };
  if (status)          		properties['Status'] 		= { select: { name: status } };
  if (notes) 				properties['Notes'] 		= { rich_text: [{ text: { content: notes } }] };

  return notion.pages.create({
    parent: { data_source_id: DB.inventory },
    properties,
  });
}

async function getCharacterInventory(characterPageId) {
  const response = await notion.dataSources.query({
    data_source_id: DB.inventory,
    filter: {
      and: [
        {
          property: 'Character',
          relation: { contains: characterPageId },
        },
        {
          property: 'Status',
          select: { equals: 'Owned' },
        },
      ],
    },
  });

  return response.results;
}

async function destroyAllCharacterItems(characterPageId) {
  const items = await getCharacterInventory(characterPageId);

  await Promise.all(
    items.map((item) =>
      notion.pages.update({
        page_id: item.id,
        properties: {
          'Status': { select: { name: 'Destroyed' } },
        },
      })
    )
  );
}

async function setItemStatus(itemPageId, status) {
  return notion.pages.update({
    page_id: itemPageId,
    properties: {
      'Status': { select: { name: status } },
    },
  });
}

// ─── league_quest_log ────────────────────────────────────────────────────────

async function createQuestLogEntry(opts) {
	const {
    	adventureName,
	    date,
	    tier,
	    characterPageIds,
	    magicItemPageId,
	    notes,
	} = opts;

	const properties = {
    	'Adventure Name': {
    		title: [{ text: { content: adventureName } }],
    	},
    	'Date': {
      		date: { start: date },
    	},
    	'Tier': {
      		select: { name: tier },
    	},
    	'Characters': {
      		relation: characterPageIds.map((id) => ({ id })),
    	},
    	'Verified': {
      		checkbox: false,
    	},
    };

  	if (magicItemPageId) {
    	properties['Magic Item Awarded'] = { relation: [{ id: magicItemPageId }] };
  	}
  	if (notes) {
    	properties['Notes'] = { rich_text: [{ text: { content: notes } }] };
  	}

  	return notion.pages.create({
    	parent: { data_source_id: DB.questLog },
    	properties,
  	});
}

async function getCharacterQuestLog(characterPageId) {
  const response = await notion.dataSources.query({
    data_source_id: DB.questLog,
    filter: {
      property: 'Characters',
      relation: { contains: characterPageId },
    },
    sorts: [{ property: 'Date', direction: 'descending' }],
  });

  return response.results;
}

// ─── league_downtime_progress ────────────────────────────────────────────────

async function createDowntimeProgress(opts) {
	const {
		  dtaId,
		  activityId,
		  activityName,
		  characterPageId,
		  activityType,
		  daysRequired,
		  daysInvested,
		  goldRequired,
		  goldInvested,
		  paramValue,
	} = opts;

	const properties = {
		  'DTA ID': {
			    rich_text: [{ text: { content: dtaId } }],
		  },
		  'Activity Name': {
			    title: [{ text: { content: activityName } }],
		  },
		  'Character': {
		    	relation: [{ id: characterPageId }],
		  },
		  'Activity Type': {
		    	select: { name: activityType },
		  },
		  'Days Required': { number: daysRequired },
		  'Days Invested': { number: daysInvested },
		  'Status': {
		    	select: { name: 'In Progress' },
		  },
		  'Started Date': {
		    	date: { start: new Date().toISOString().split('T')[0] },
		  },
	};

	if (activityId) properties['Activity ID'] = { rich_text: [{ text: { content: activityId } }] };
	if (paramValue != null) properties['Param Value'] = { rich_text: [{ text: { content: String(paramValue) } }] };
	if (goldRequired != null) properties['Gold Required'] = { number: goldRequired };
	if (goldInvested != null) properties['Gold Invested'] = { number: goldInvested };

	return notion.pages.create({
		  parent: { data_source_id: DB.downtime },
		  properties,
	});
}

async function getDowntimeProgressById(dtaId) {
    const response = await notion.dataSources.query({
        data_source_id: DB.downtime,
        filter: { property: 'DTA ID', rich_text: { equals: dtaId.toUpperCase() } },
        page_size: 1,
    });
    return response.results[0] ?? null;
}

async function getActiveDowntimeForCharacter(characterPageId) {
    const response = await notion.dataSources.query({
        data_source_id: DB.downtime,
        filter: {
            and: [
                { property: 'Character', relation: { contains: characterPageId } },
                { property: 'Status', select: { equals: 'In Progress' } },
            ],
        },
    });
    return response.results;
}

async function investDowntimeProgress(pageId, { daysInvested, goldInvested }) {
    const props = {};
    if (daysInvested != null) props['Days Invested'] = { number: daysInvested };
    if (goldInvested != null) props['Gold Invested'] = { number: goldInvested };
    return notion.pages.update({ page_id: pageId, properties: props });
}

async function setDowntimeStatus(pageId, status) {
    return notion.pages.update({
        page_id: pageId,
        properties: { 'Status': { select: { name: status } } },
    });
}

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
    const response = await notion.dataSources.query({ data_source_id: DB.shop });
    return response.results;
}

// ─── player_marketplace ──────────────────────────────────────────────────────

async function getOpenListings({ rarity, sortBy } = {}) {
    const filters = [{ property: 'Status', select: { equals: 'Open' } }];
    if (rarity) filters.push({ property: 'Rarity', select: { equals: rarity } });

    const response = await notion.dataSources.query({
        data_source_id: DB.marketplace,
        filter: { and: filters },
        sorts: [{ property: sortBy ?? 'Listed Date', direction: 'descending' }],
    });

    const enriched = await Promise.all(response.results.map(async listing => {
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
      date: { start: new Date().toISOString().split('T')[0] },
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
      date: { start: new Date().toISOString().split('T')[0] },
    },
  };

  if (notes) properties['Notes'] = { rich_text: [{ text: { content: notes } }] };

  return notion.pages.create({
    parent: { data_source_id: DB.trades },
    properties,
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
	// Helper
	updatePageProperty,
	getCharacterGold,
	setCharacterGold,
	getPageById,

	// Characters
	getActiveCharacter,
	getCharactersByDiscordId,
	searchCharactersByName,
	queryLeaderboard,
	createCharacter,
	setCharacterStatus,
	adjustCharacterNumber,
	adjustCharacterNumbers,
	adjustCharacterNumbersUnlocked,
	setCharacterLevel,
	updateCharacterArt,

	// Inventory
	createInventoryItem,
	getCharacterInventory,
	destroyAllCharacterItems,
	setItemStatus,

	// Quest Log
	createQuestLogEntry,
	getCharacterQuestLog,

	// Concurrency
	withPageLock,

	// Downtime
	createDowntimeProgress,
	getDowntimeProgressById,
	getActiveDowntimeForCharacter,
	investDowntimeProgress,
	setDowntimeStatus,

	// Marketplace
	getOpenListings,
	createListing,
	getListingById,
	generateListingId,

	// Trades
	createTrade,
};
