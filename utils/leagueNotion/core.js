const { Client } = require('@notionhq/client');
const client = require('../../client');
const { reportError } = require('../errorReporter');

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

const schemaCache = new Map();

async function getKnownProperties(dataSourceId) {
    if (schemaCache.has(dataSourceId)) return schemaCache.get(dataSourceId);
    try {
        const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
        const names = new Set(Object.keys(ds.properties));
        schemaCache.set(dataSourceId, names);
        return names;
    } catch (err) {
        console.error(`[leagueNotion] Could not fetch schema for data source ${dataSourceId} — property filtering disabled for this run:`, err.message);
        reportError(client, {
            scope: '[leagueNotion]',
            message: `Could not fetch schema for data source \`${dataSourceId}\` — property validation is disabled for this run, so mistyped/renamed properties won't be caught until the next successful schema fetch.`,
            error: err,
        }).catch(() => {});
        schemaCache.set(dataSourceId, null);
        return null;
    }
}

async function withKnownProperties(dataSourceId, properties, contextLabel = '') {
    const known = await getKnownProperties(dataSourceId);
    if (known === null) return properties;
    const filtered = {};
    const dropped = [];
    for (const [name, value] of Object.entries(properties)) {
        if (known.has(name)) filtered[name] = value;
        else dropped.push(name);
    }
    if (dropped.length) {
        console.warn(`[leagueNotion] Skipped missing propert${dropped.length === 1 ? 'y' : 'ies'} on Notion write${contextLabel ? ` (${contextLabel})` : ''}: ${dropped.map(d => `"${d}"`).join(', ')}. Add ${dropped.length === 1 ? 'this column' : 'these columns'} to the database to stop losing this data.`);
    }
    return filtered;
}

function clearSchemaCache(dataSourceId) {
    if (dataSourceId) schemaCache.delete(dataSourceId);
    else schemaCache.clear();
}

const pageLocks = new Map();

function withPageLock(pageId, fn) {
	const previous = pageLocks.get(pageId) ?? Promise.resolve();
	const run = previous.then(fn, fn);
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

async function getPageById(pageId) {
    return notion.pages.retrieve({ page_id: pageId });
}

async function queryAllPages(dataSourceId, params = {}) {
	const results = [];
	let cursor;
	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			...params,
			page_size: 100,
			...(cursor ? { start_cursor: cursor } : {}),
		});
		results.push(...response.results);
		cursor = response.has_more ? response.next_cursor : undefined;
	} while (cursor);
	return results;
}

function withTwoPageLocks(pageIdA, pageIdB, fn) {
  const [first, second] = [pageIdA, pageIdB].sort();
  return withPageLock(first, () => withPageLock(second, fn));
}

module.exports = {
    notion,
    DB,
    withKnownProperties,
    clearSchemaCache,
    withPageLock,
    withTwoPageLocks,
    updatePageProperty,
    getPageById,
    queryAllPages,
};
