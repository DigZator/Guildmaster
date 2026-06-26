const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB = {
  characters:  process.env.LEAGUE_CHARACTERS_DB_ID,
  // inventory:   process.env.LEAGUE_INVENTORY_DB_ID,
  // questLog:    process.env.LEAGUE_QUEST_LOG_DB_ID,
  // downtime:    process.env.LEAGUE_DOWNTIME_DB_ID,
  // trades:      process.env.LEAGUE_TRADES_DB_ID,
  // shop:        process.env.GUILD_SHOP_DB_ID,
  // marketplace: process.env.PLAYER_MARKETPLACE_DB_ID,
};

// ─── helper ───────────────────────────────────────────────────────

async function updatePageProperty(pageId, properties) {
	return await notion.pages.update({
		page_id: pageId,
		properties,
	});
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
  const page = await notion.pages.retrieve({ page_id: pageId });
  const current = page.properties[field]?.number ?? 0;
  const updated = current + delta;

  return notion.pages.update({
    page_id: pageId,
    properties: {
      [field]: { number: updated },
    },
  });
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
    notes,
  } = opts;

  const properties = {
    'Item Name': {
      title: [{ text: { content: itemName } }],
    },
    'Character': {
      relation: [{ id: characterPageId }],
    },
    'Rarity': {
      select: { name: rarity },
    },
    'Type': {
      select: { name: type },
    },
    'Source': {
      select: { name: source },
    },
    'Date Acquired': {
      date: { start: new Date().toISOString().split('T')[0] },
    },
    'Status': {
      select: { name: 'Active' },
    },
  };

  if (subtype) properties['Subtype'] = { select: { name: subtype } };
  if (sourceQuestId) properties['Source Quest'] = { relation: [{ id: sourceQuestId }] };
  if (itemValue != null) properties['Item Value'] = { number: itemValue };
  if (notes) properties['Notes'] = { rich_text: [{ text: { content: notes } }] };

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
          select: { equals: 'Active' },
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
		  activityName,
		  characterPageId,
		  activityType,
		  daysRequired,
		  daysInvested,
		  goldRequired,
		  goldInvested,
	} = opts;

	const properties = {
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

	if (goldRequired != null) properties['Gold Required'] = { number: goldRequired };
	if (goldInvested != null) properties['Gold Invested'] = { number: goldInvested };

	return notion.pages.create({
		  parent: { data_source_id: DB.downtime },
		  properties,
	});
}

// ─── guild_shop ──────────────────────────────────────────────────────────────

async function getShopItems(playerTier) {
  const response = await notion.dataSources.query({
    data_source_id: DB.shop,
    filter: {
      and: [
        {
          property: 'Available',
          checkbox: { equals: true },
        },
        {
          property: 'Tier Minimum',
          formula: { number: { less_than_or_equal_to: playerTier } },
        },
      ],
    },
    sorts: [{ property: 'Rarity', direction: 'ascending' }],
  });

  return response.results;
}

// ─── player_marketplace ──────────────────────────────────────────────────────

async function getOpenListings() {
  const response = await notion.dataSources.query({
    data_source_id: DB.marketplace,
    filter: {
      property: 'Status',
      select: { equals: 'Open' },
    },
    sorts: [{ property: 'Listed Date', direction: 'descending' }],
  });

  return response.results;
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
	  
	  // Characters
	  getActiveCharacter,
	  getCharactersByDiscordId,
	  createCharacter,
	  setCharacterStatus,
	  adjustCharacterNumber,
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

	  // Downtime
	  createDowntimeProgress,

	  // Shop
	  getShopItems,

	  // Marketplace
	  getOpenListings,
	  createListing,

	  // Trades
	  createTrade,
};
