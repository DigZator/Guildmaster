const { todayISTDateString } = require('../dateFormat');
const { notion, DB, withKnownProperties } = require('./core');

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
		  quantity,
		  spellName,
		  itemChoice,
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
		    	date: { start: todayISTDateString() },
		  },
	};

	if (activityId) properties['Activity ID'] = { rich_text: [{ text: { content: activityId } }] };
	if (paramValue != null) properties['Param Value'] = { rich_text: [{ text: { content: String(paramValue) } }] };
	if (goldRequired != null) properties['Gold Required'] = { number: goldRequired };
	if (goldInvested != null) properties['Gold Invested'] = { number: goldInvested };
	if (quantity != null) properties['Quantity'] = { number: quantity };
	if (spellName) properties['Spell Name'] = { rich_text: [{ text: { content: spellName } }] };
	if (itemChoice) properties['Item Choice'] = { rich_text: [{ text: { content: itemChoice } }] };

	const safeProperties = await withKnownProperties(DB.downtime, properties, 'createDowntimeProgress');

	return notion.pages.create({
		  parent: { data_source_id: DB.downtime },
		  properties: safeProperties,
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

async function getDowntimeForCharacterByStatus(characterPageId, status) {
    const response = await notion.dataSources.query({
        data_source_id: DB.downtime,
        filter: {
            and: [
                { property: 'Character', relation: { contains: characterPageId } },
                { property: 'Status', select: { equals: status } },
            ],
        },
    });
    return response.results;
}

// Guild-wide — used to surface completion-approval requests in /leagueadmin pending.
async function getDowntimeByStatus(status) {
    const response = await notion.dataSources.query({
        data_source_id: DB.downtime,
        filter: { property: 'Status', select: { equals: status } },
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

module.exports = {
    createDowntimeProgress,
    getDowntimeProgressById,
    getActiveDowntimeForCharacter,
    getDowntimeForCharacterByStatus,
    getDowntimeByStatus,
    investDowntimeProgress,
    setDowntimeStatus,
};
