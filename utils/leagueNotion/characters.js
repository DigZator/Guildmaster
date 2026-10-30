const { todayISTDateString } = require('../dateFormat');
const { notion, DB, withPageLock, updatePageProperty, queryAllPages } = require('./core');

async function getCharacterGold(characterId) {
	const page = await notion.pages.retrieve({ page_id: characterId});
	return page.properties['Gold']?.number ?? 0;
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
  return queryAllPages(DB.characters, {
    filter: {
      property: 'Discord ID',
      rich_text: { equals: discordId },
    },
  });
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

async function queryLeaderboard({ sortBy = 'level', order = 'descending', className = null, species = null, status = null, limit = 100 } = {}) {
  const sortProperty = LEADERBOARD_SORT_FIELDS[sortBy] ?? 'Level';

  const filters = [];
  if (className) filters.push({ property: 'Class', rich_text: { contains: className } });
  if (species)   filters.push({ property: 'Species', rich_text: { contains: species } });
  if (status)    filters.push({ property: 'Status', select: { equals: status } });

  const response = await notion.dataSources.query({
    data_source_id: DB.characters,
    ...(filters.length > 0 ? { filter: filters.length === 1 ? filters[0] : { and: filters } } : {}),
    sorts: [{ property: sortProperty, direction: order }],
    page_size: limit,
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
        date: { start: todayISTDateString() },
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

// ─── Character status audit ────────────────────────────────────────────────

async function findCharacterStatusIssues() {
  const allCharacters = await queryAllPages(DB.characters);

  const byDiscordId = new Map();
  for (const page of allCharacters) {
    const discordId = page.properties['Discord ID']?.rich_text?.[0]?.plain_text ?? null;
    if (!discordId) continue;
    if (!byDiscordId.has(discordId)) byDiscordId.set(discordId, []);
    byDiscordId.get(discordId).push(page);
  }

  const violations = [];
  const noActive = [];

  for (const [discordId, characters] of byDiscordId.entries()) {
    const activeOnes = characters.filter(c => c.properties['Status']?.select?.name === 'Active');

    if (activeOnes.length > 1) {
      violations.push({ discordId, characters: activeOnes });
    } else if (activeOnes.length === 0 && characters.length > 0) {
      noActive.push({ discordId, characters });
    }
  }

  return { violations, noActive };
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

module.exports = {
    getCharacterGold,
    getActiveCharacter,
    getCharactersByDiscordId,
    searchCharactersByName,
    queryLeaderboard,
    createCharacter,
    setCharacterStatus,
    findCharacterStatusIssues,
    adjustCharacterNumber,
    adjustCharacterNumbers,
    adjustCharacterNumbersUnlocked,
    setCharacterLevel,
    updateCharacterArt,
};
