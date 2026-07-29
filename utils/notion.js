require('dotenv').config();
const { Client } = require('@notionhq/client');
const { formatDateForDisplay } = require('./dateFormat');

const URL = "https://adventuring-guild-mumbai.notion.site/api/v3/queryCollection";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATASOURCE_ID = process.env.DATASOURCE_ID;
const SEATS_DATASOURCE_ID = process.env.SEATS_DATASOURCE_ID;

async function fetchGames() {
	const games  = [];
	const seatRecords = await fetchSeats();
	
	let cursor = undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: DATASOURCE_ID,
			start_cursor: cursor,
			page_size: 100,
		});

		for (const page of response.results) {
            const p = page.properties;
            const system = p['System'].select?.name ?? '';
            const otherSystem = p['Other System'].rich_text[0]?.plain_text ?? '';
            const startDate = p['Start Date'].date?.start ?? '';
            const endDate = p['End Date'].date?.start ?? '';

            games.push({
                uid:              page.id,
                createdTime:      page.created_time,
                title:            p['Title'].title[0]?.plain_text ?? '',
                dm:               p['DM Name'].rich_text[0]?.plain_text ?? '',
                system:           system === 'Other' && otherSystem ? otherSystem : system,
                format:           p['Game Type'].select?.name ?? '',
                type:             p['Session Type'].select?.name ?? '',
                experienceLevel:  p['Experience Level'].select?.name ?? '',
                level:            p['Level'].number,
                rawDate:          startDate,
                date:             p['Session Date'].formula.string ?? '',
                time:             p['Session Time'].formula.string ?? '',
                blurb:            p['Description'].rich_text[0]?.plain_text ?? '',
                classes:          p['Classes Allowed'].rich_text[0]?.plain_text ?? '',
                species:          p['Species Allowed'].rich_text[0]?.plain_text ?? '',
                tone:			  p['Tone, Style and Lethality'].rich_text[0]?.plain_text ?? '',
                tableExpect:	  p['Table/Tool Expectation'].rich_text[0]?.plain_text ?? '',
                expDetailed:	  p['Experience Detailed'].rich_text[0]?.plain_text ?? '',
                addRestrict:	  p['Additional Restrictions'].rich_text[0]?.plain_text ?? '',
                notes:            p['Other Notes'].rich_text[0]?.plain_text ?? '',
                artist:           p['Art Credits'].rich_text[0]?.plain_text ?? '',
                artistLink:       p['Artist Link'].url ?? '',
                location:         p['Location'].rich_text[0]?.plain_text ?? '',
                price:            p['Price Type'].select?.name ?? '',
                openSeats:        countOpenSeats(seatRecords, page.id),
                totalSeats:       seatRecords.filter(s => s.gameId === page.id).length,
                warnings:         p['Content Warnings'].multi_select.map(o => o.name).join(', '),
                registrationLink: p['Registration Link']?.url ?? '',
                show:             p['Show'].checkbox,
                activate:         p['Activate'].checkbox,
                artURL:           p['Cover Art'].files[0]?.file?.url ?? p['Cover Art'].files[0]?.external?.url ?? null,
                rline:            p['Registration Line']?.rich_text?.[0]?.plain_text ?? '',
            });
        }
        cursor = response.has_more ? response.next_cursor : undefined;
	} while (cursor);

	return games;
}

async function fetchSeats() {
	const seats = [];
	let cursor = undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: SEATS_DATASOURCE_ID,
			start_cursor: cursor,
			page_size: 100,
		});

		for (const page of response.results) {
			seats.push({
				gameId: page.properties['Table'].relation[0]?.id ?? null,
				taken: page.properties['Player'].relation.length > 0,
			})
		}
		cursor = response.has_more ? response.next_cursor : undefined;
	} while (cursor);
	
	return seats;
}

function countOpenSeats(seats, gamePageId) {
	let seatCount = 0;
	return seats.filter(s => {
		return s.gameId === gamePageId && !s.taken;
	}).length;
}

async function fetchGameByUID(uid) {
	const { getCachedGames } = require('./cache');
	const games = await getCachedGames();
	return games.find(g => g.uid === uid) || null;
}

async function updateGameProperties(uid, properties) {
	await notion.pages.update({
		page_id: uid,
		properties,
	});
}

async function fetchPage(uid) {
	return notion.pages.retrieve({ page_id: uid });
}

function stringifyPropertyValue(fieldType, rawProperty) {
	if (!rawProperty) return '';

	switch (fieldType) {
		case 'title':
			return rawProperty.title?.map(t => t.plain_text).join('') ?? '';

		case 'rich_text':
			return rawProperty.rich_text?.map(t => t.plain_text).join('') ?? '';

		case 'number':
			return rawProperty.number != null ? String(rawProperty.number) : '';

		case 'checkbox':
			return rawProperty.checkbox != null ? String(rawProperty.checkbox) : '';

		case 'url':
			return rawProperty.url ?? '';

		case 'select':
			return rawProperty.select?.name ?? '';

		case 'multi_select':
			return rawProperty.multi_select?.map(o => o.name).join(', ') ?? '';

		case 'date':
			return formatDateForDisplay(rawProperty.date?.start);

		case 'files':
			return rawProperty.files?.[0]?.file?.url ?? rawProperty.files?.[0]?.external?.url ?? '';

		default:
			return '';
	}
}

module.exports = { fetchGames, fetchGameByUID, updateGameProperties, fetchPage, stringifyPropertyValue }
