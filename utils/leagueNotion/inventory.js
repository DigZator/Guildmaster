const { todayISTDateString } = require('../dateFormat');
const { notion, DB, queryAllPages } = require('./core');

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
      date: { start: todayISTDateString() },
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
  return queryAllPages(DB.inventory, {
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

module.exports = {
    createInventoryItem,
    getCharacterInventory,
    destroyAllCharacterItems,
    setItemStatus,
};
