require('dotenv').config();
const dns = require('dns').promises;
const net = require('net');
const { Client } = require('@notionhq/client');
const { formatDateForDisplay } = require('./dateFormat');

const URL = "https://adventuring-guild-mumbai.notion.site/api/v3/queryCollection";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATASOURCE_ID = process.env.DATASOURCE_ID;
const SEATS_DATASOURCE_ID = process.env.SEATS_DATASOURCE_ID;
const PLAYERS_DATASOURCE_ID = process.env.PLAYERS_DATASOURCE_ID;

function richText(segments) {
	return (segments ?? []).map(t => t.plain_text).join('');
}

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
            try {
                const p = page.properties;
                const system = p['System'].select?.name ?? '';
                const otherSystem = richText(p['Other System'].rich_text);
                const startDate = p['Start Date'].date?.start ?? '';
                const endDate = p['End Date'].date?.start ?? '';

                games.push({
                    uid:              page.id,
                    createdTime:      page.created_time,
                    title:            p['Title'].title[0]?.plain_text ?? '',
                    dm:               richText(p['DM Name'].rich_text),
                    system:           system === 'Other' && otherSystem ? otherSystem : system,
                    format:           p['Game Type'].select?.name ?? '',
                    type:             p['Session Type'].select?.name ?? '',
                    experienceLevel:  p['Experience Level'].select?.name ?? '',
                    level:            p['Level'].number,
                    rawDate:          startDate,
                    date:             p['Session Date'].formula.string ?? '',
                    time:             p['Session Time'].formula.string ?? '',
                    blurb:            richText(p['Description'].rich_text),
                    classes:          richText(p['Classes Allowed'].rich_text),
                    species:          richText(p['Species Allowed'].rich_text),
                    tone:			  richText(p['Tone, Style and Lethality'].rich_text),
                    tableExpect:	  richText(p['Table/Tool Expectation'].rich_text),
                    expDetailed:	  richText(p['Experience Detailed'].rich_text),
                    addRestrict:	  richText(p['Additional Restrictions'].rich_text),
                    notes:            richText(p['Other Notes'].rich_text),
                    artist:           richText(p['Art Credits'].rich_text),
                    artistLink:       p['Artist Link'].url ?? '',
                    location:         richText(p['Location'].rich_text),
                    price:            p['Price Type'].select?.name ?? '',
                    openSeats:        countOpenSeats(seatRecords, page.id),
                    totalSeats:       seatRecords.filter(s => s.gameId === page.id).length,
                    warnings:         p['Content Warnings'].multi_select.map(o => o.name).join(', '),
                    registrationLink: p['Registration Link']?.url ?? '',
                    show:             p['Show'].checkbox,
                    activate:         p['Activate'].checkbox,
                    reminderOverride: p['Reminder Override']?.checkbox ?? false,
                    artURL:           p['Cover Art'].files[0]?.file?.url ?? p['Cover Art'].files[0]?.external?.url ?? null,
                    rline:            richText(p['Registration Line']?.rich_text),
                });
            } catch (err) {
                console.error(`[fetchGames] Skipping page ${page.id} — failed to parse properties:`, err.message);
                continue;
            }
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
				id: page.id,
				gameId: page.properties['Table'].relation[0]?.id ?? null,
				playerId: page.properties['Player'].relation[0]?.id ?? null,
				taken: page.properties['Player'].relation.length > 0,
				status: page.properties['Seat Status']?.select?.name ?? null,
				createdTime: page.created_time,
			})
		}
		cursor = response.has_more ? response.next_cursor : undefined;
	} while (cursor);
	
	return seats;
}

function countOpenSeats(seats, gamePageId) {
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

// --- Table-admin write helpers -------------------------------------------
async function createSeat(gameUID, status) {
	const properties = {
		'Table': { relation: [{ id: gameUID }] },
	};
	if (status) {
		properties['Seat Status'] = { select: { name: status } };
	}
	return notion.pages.create({
		parent: { data_source_id: SEATS_DATASOURCE_ID },
		properties,
	});
}

async function createPlayerPage(name) {
	if (!PLAYERS_DATASOURCE_ID) {
		throw new Error('PLAYERS_DATASOURCE_ID is not set in .env — cannot create a Players DB page yet.');
	}
	return notion.pages.create({
		parent: { data_source_id: PLAYERS_DATASOURCE_ID },
		properties: {
			'Name': { title: [{ text: { content: name } }] },
		},
	});
}

async function assignPlayerToSeat(seatId, playerPageId) {
	return notion.pages.update({
		page_id: seatId,
		properties: {
			'Player': { relation: [{ id: playerPageId }] },
		},
	});
}

async function setSeatStatus(seatId, status) {
	return notion.pages.update({
		page_id: seatId,
		properties: {
			'Seat Status': { select: { name: status } },
		},
	});
}

async function fetchAllPlayers() {
	if (!PLAYERS_DATASOURCE_ID) {
		throw new Error('PLAYERS_DATASOURCE_ID is not set in .env — cannot query the Players DB yet.');
	}
	const players = [];
	let cursor = undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: PLAYERS_DATASOURCE_ID,
			start_cursor: cursor,
			page_size: 100,
		});
		for (const page of response.results) {
			players.push(page); // raw page
		}
		cursor = response.has_more ? response.next_cursor : undefined;
	} while (cursor);

	return players;
}

// --- Cover art re-hosting  ---------
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const UPLOAD_MAX_REDIRECTS = 3;
const UPLOAD_FETCH_TIMEOUT_MS = 20 * 1000;

const IMAGE_TYPES = [
    { mime: 'image/png',  ext: 'png',  test: b => b.length > 8  && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { mime: 'image/jpeg', ext: 'jpg',  test: b => b.length > 3  && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: 'image/gif',  ext: 'gif',  test: b => b.length > 6  && b.toString('ascii', 0, 4) === 'GIF8' },
    { mime: 'image/webp', ext: 'webp', test: b => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

function sniffImageType(buf) {
    return IMAGE_TYPES.find(t => t.test(buf)) ?? null;
}

function isPrivateAddress(ip) {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
               (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    }
    if (net.isIPv6(ip)) {
        const v = ip.toLowerCase();
        return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
    }
    return true;
}

async function assertPublicHttps(urlStr) {
    let url;
    try { url = new globalThis.URL(urlStr); } catch { throw new Error('That link is not a valid URL.'); }
    if (url.protocol !== 'https:') throw new Error('Only https:// links are supported.');
    const records = await dns.lookup(url.hostname, { all: true }).catch(() => {
        throw new Error('Could not resolve that link\'s host.');
    });
    if (records.length === 0 || records.some(r => isPrivateAddress(r.address))) {
        throw new Error('That link points to a non-public address.');
    }
    return url;
}

async function readLimited(res) {
    const declared = Number(res.headers.get('content-length'));
    if (declared && declared > UPLOAD_MAX_BYTES) throw new Error('Image is too large (20 MB max).');

    const chunks = [];
    let received = 0;
    for await (const chunk of res.body) {
        received += chunk.length;
        if (received > UPLOAD_MAX_BYTES) throw new Error('Image is too large (20 MB max).');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function downloadImage(urlStr) {
    let current = urlStr;
    for (let hop = 0; hop <= UPLOAD_MAX_REDIRECTS; hop++) {
        const url = await assertPublicHttps(current);
        const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(UPLOAD_FETCH_TIMEOUT_MS) })
            .catch(() => { throw new Error('Could not download that link.'); });

        if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get('location')) {
            current = new globalThis.URL(res.headers.get('location'), url).toString();
            continue;
        }
        if (!res.ok) throw new Error(`Could not download that link (HTTP ${res.status}).`);

        const buffer = await readLimited(res);
        const type = sniffImageType(buffer);
        if (!type) throw new Error('That is not a PNG, JPEG, GIF or WebP image.');
        return { buffer, type };
    }
    throw new Error('Too many redirects.');
}

function safeBaseName(raw) {
    const base = String(raw ?? '').split(/[?#]/)[0].split('/').pop().replace(/\.[^.]+$/, '');
    return base.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'cover';
}

async function rehostImageToNotion(sourceUrl, nameHint) {
    const { buffer, type } = await downloadImage(sourceUrl);
    const filename = `${safeBaseName(nameHint ?? sourceUrl)}.${type.ext}`;

    const upload = await notion.fileUploads.create({
        mode: 'single_part',
        filename,
        content_type: type.mime,
    });

    await notion.fileUploads.send({
        file_upload_id: upload.id,
        file: { filename, data: new Blob([buffer], { type: type.mime }) },
    });

    return { fileUploadId: upload.id, filename };
}

function filesPropertyFromUpload({ fileUploadId, filename }) {
    return { files: [{ name: filename, type: 'file_upload', file_upload: { id: fileUploadId } }] };
}

module.exports = { fetchGames, fetchGameByUID, updateGameProperties, fetchPage, stringifyPropertyValue, countOpenSeats, fetchSeats, createSeat, createPlayerPage, assignPlayerToSeat, setSeatStatus, fetchAllPlayers, rehostImageToNotion, filesPropertyFromUpload }
