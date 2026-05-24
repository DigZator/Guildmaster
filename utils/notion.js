const URL = "https://adventuring-guild-mumbai.notion.site/api/v3/queryCollection";

const HEADERS = {
    "Content-Type": "application/json",
    "notion-client-version": "23.13.20260424.1200",
    "notion-audit-log-platform": "web",
    "x-notion-active-user-header": "",
    "Origin": "https://adventuring-guild-mumbai.notion.site",
    "Referer": "https://adventuring-guild-mumbai.notion.site/2292380d35ca80418cf4c8a1588a19dc?v=2292380d35ca809490d0000c32aaf74d",
};

const PAYLOAD = {
    collectionView: { id: "2292380d-35ca-8094-90d0-000c32aaf74d", spaceId: "" },
    collectionViewBlock: { id: "2292380d-35ca-8041-8cf4-c8a1588a19dc", spaceId: "" },
    clientType: "notion_app",
    userTimeZone: "Asia/Kolkata",
    isFullScreen: true,
    isMobile: false,
};

const SEATS_PAYLOAD = {
    collectionView: { id: "2292380d-35ca-8097-a7f8-000c060689e1", spaceId: "" },
    collectionViewBlock: { id: "2292380d-35ca-80b9-b299-f60953997601", spaceId: "" },
    clientType: "notion_app",
    userTimeZone: "Asia/Kolkata",
    isFullScreen: true,
    isMobile: false,
};

async function fetchRaw() {
    const response = await fetch(URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(PAYLOAD)
    });
    const data = await response.json();
    return Object.values(data.recordMap.block).filter(b =>
        b.value?.value?.parent_table === 'collection' &&
        b.value?.value?.type === 'page'
    );
}

function getDate(props, key) {
    try { return props[key][0][1][0][1]; }
    catch { return {}; }
}

function getUID(blockId) {
    return blockId.split('-').pop();
}

function getText(props, key) {
    try { return props[key][0][0]; }
    catch { return ''; }
}

function formatDate(str) {
    if (!str) return '';
    const [year, month, day] = str.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
}

function formatTime(str, timezone = 'UTC') {
    if (!str) return '';
    const [hours, minutes] = str.split(':').map(Number);
    const offsetMinutes = timezone === 'UTC' ? 330 : 0;
    const totalMinutes = hours * 60 + minutes + offsetMinutes;
    const adjustedHours = Math.floor(totalMinutes / 60) % 24;
    const adjustedMinutes = totalMinutes % 60;
    const d = new Date(1970, 0, 1, adjustedHours, adjustedMinutes);
    return d.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

async function fetchGames() {
    const blocks = await fetchRaw();
    const seatBlocks = await fetchSeats();

    
    return blocks.map(b => {
        const block = b.value.value;
        const props = block.properties;
        const start = getDate(props, 'k|VL');
        const end = getDate(props, 'To;]');
        const system = getText(props, '[zrW');
        const otherSystem = getText(props, ';XHz');

        return {
            uid:              block.id.split('-').pop(),
            createdTime:      block.created_time,
            title:            getText(props, 'title'),
            dm:               getText(props, 'SPnV'),
            system:           system === 'Other' && otherSystem ? otherSystem : system,
            format:           getText(props, '>}g{'),
            type:             getText(props, '|fRn'),
            experienceLevel:  getText(props, '|}tH'),
            level:            getText(props, 'mul~'),
            date:             formatDate(start.start_date),
            time: `${formatTime(start.start_time, start.time_zone)} to ${formatTime(end.start_time, end.time_zone)}`,
            rawDate:          start.start_date || '',
            blurb:            getText(props, 'BjJV'),
            classes:          getText(props, '{WSY'),
            species:          getText(props, 'Ixus'),
            notes:            getText(props, 'uXf_'),
            artist:           getText(props, 'J?h{'),
            artistLink:       getText(props, 'kFtu'),
            location:         getText(props, 'Plyx'),
            price:            getText(props, 'IiTI'),
            openSeats:        countOpenSeats(seatBlocks, block.id),
            warnings:         getText(props, 'zjcl'),
            registrationLink: getText(props, ']HCL'),
            show:             getText(props, 'u<SL') === 'Yes',
            activate:         getText(props, '?:QW') === 'Yes',
            artURL:           getArtURL(props),
            rline:            `**!! Register by clicking the link below !!**`,
        };
    });
}

async function fetchGameByUID(uid) {
    const games = await fetchGames();
    return games.find(g => g.uid === uid) || null;
}

function getArtURL(props) {
    try {
        const raw = props['>>mS'][0];
        const link = raw[1][0][1];
        if (link.startsWith('http')) return link;
        return null;
    } catch {
        return null;
    }
}

async function fetchSeats() {
    const response = await fetch(URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(SEATS_PAYLOAD)
    });
    const data = await response.json();
    return Object.values(data.recordMap.block).filter(b =>
        b.value?.value?.parent_table === 'collection' &&
        b.value?.value?.type === 'page'
    );
}

function countOpenSeats(seatBlocks, uid) {
    const normalize = id => id?.toLowerCase().replace(/-/g, '');
    const normalizedUid = normalize(uid);

    return seatBlocks.filter(b => {
        const props = b?.value?.value?.properties;
        if (!props) return false;
        const gameId = props[']b~|']?.[0]?.[1]?.[0]?.[1];
        return normalize(gameId) === normalizedUid && !props['^IxV'];
    }).length;
}


module.exports = { fetchGames, getText, fetchGameByUID, fetchSeats, countOpenSeats };

// fetchGames().then(games => {
//     console.log(games);
// }).catch(err => {
//     console.error('Error fetching games:', err);
// });

// fetchSeats().then(blocks => {
//     console.log(JSON.stringify(blocks[0], null, 2));
// });
