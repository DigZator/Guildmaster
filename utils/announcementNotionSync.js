const { updateGameProperties } = require('./notion');
const { formatValue } = require('./editGameFormat');

const FIELD_TO_NOTION = {
    title:            { notion_key: 'Title',              type: 'title' },
    blurb:            { notion_key: 'Description',        type: 'rich_text' },
    dm:               { notion_key: 'DM Name',             type: 'rich_text' },
    system:           { notion_key: 'System',              type: 'select' },
    level:            { notion_key: 'Level',                type: 'number' },
    experienceLevel:  { notion_key: 'Experience Level',    type: 'select' },
    warnings:         { notion_key: 'Content Warnings',    type: 'multi_select' },
    rline:            { notion_key: 'Registration Line',   type: 'rich_text' },
    registrationLink: { notion_key: 'Registration Link',   type: 'url' },
    notes:            { notion_key: 'Other Notes',         type: 'rich_text' },
    location:         { notion_key: 'Location',             type: 'rich_text' },
    classes:          { notion_key: 'Classes Allowed',     type: 'rich_text' },
    species:          { notion_key: 'Species Allowed',     type: 'rich_text' },
    artist:           { notion_key: 'Art Credits',          type: 'rich_text' },
    price:            { notion_key: 'Price Type',           type: 'select' },
    artURL:           { notion_key: 'Cover Art',            type: 'files' },
};

const UNSYNCED_FIELDS = new Set(['date', 'time']);

function isSyncableField(field) {
    return Object.prototype.hasOwnProperty.call(FIELD_TO_NOTION, field);
}

async function syncAnnouncementFieldToNotion(game, field, value) {
    if (UNSYNCED_FIELDS.has(field)) {
        return { synced: false, reason: 'not_supported' };
    }

    const mapping = FIELD_TO_NOTION[field];
    if (!mapping) {
        return { synced: false, reason: 'not_supported' };
    }

    if (!game?.uid) {
        return { synced: false, reason: 'missing_uid' };
    }

    try {
        const formattedValue = formatValue(mapping.type, value ?? '');
        await updateGameProperties(game.uid, { [mapping.notion_key]: formattedValue });
        return { synced: true };
    } catch (error) {
        console.error(`[announcementNotionSync] Failed to sync "${field}" for game ${game.uid}:`, error);
        return { synced: false, reason: 'notion_error', error };
    }
}

module.exports = { syncAnnouncementFieldToNotion, isSyncableField, FIELD_TO_NOTION, UNSYNCED_FIELDS };
