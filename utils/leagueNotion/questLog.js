const { notion, DB, queryAllPages } = require('./core');

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
  return queryAllPages(DB.questLog, {
    filter: {
      property: 'Characters',
      relation: { contains: characterPageId },
    },
    sorts: [{ property: 'Date', direction: 'descending' }],
  });
}

module.exports = {
    createQuestLogEntry,
    getCharacterQuestLog,
};
