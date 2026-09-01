// Ticket type definitions — config-driven, not hardcoded per-type logic.
// Persisted to data/ticketTypes.json so admins can add/edit/remove types at
// runtime via `/ticket type add|edit|remove|list` without a redeploy.
//
//   key           - internal id, used in ticketStore records + customIds
//   label         - shown on the dashboard button + embeds
//   buttonEmoji   - emoji shown on the dashboard button
//   slug          - used in the channel name, e.g. `#hr-000-janedoe`
//   channelTag    - short tag used in the channel name (falls back to slug)
//   modalTitle    - optional override for the creation modal title
//   viewerRoleId  - role pinged/referenced for this ticket type (does NOT grant channel perms — see categoryGroup)
//   pingTargetId  - role or user id pinged on creation (may differ from viewerRoleId)
//   categoryGroup - which ticket category this type's channels are created under ('normal' | 'hr').

const path = require('path');
const { createJsonStore } = require('../utils/jsonStore');

const DEFAULT_TICKET_TYPES = [
    {
        key: 'game_support',
        label: 'Game - Announcement, Digital Asset Req and Support',
        modalTitle: 'Game - Announcement / Asset / Support',
        buttonEmoji: '🎮',
        slug: 'game-support',
        channelTag: 'GA',
        viewerRoleId: process.env.ADMINS_ROLE_ID || null,
        pingTargetId: process.env.CMD_ROLE_ID || null,
        categoryGroup: 'normal',
    },
    {
        key: 'discord_support',
        label: 'Discord Support',
        buttonEmoji: '💬',
        slug: 'discord-support',
        channelTag: 'DS',
        viewerRoleId: process.env.ADMINS_ROLE_ID || null,
        pingTargetId: process.env.CMD_ROLE_ID || null,
        categoryGroup: 'normal',
    },
    {
        key: 'hr',
        label: 'HR Ticket',
        buttonEmoji: '🗂️',
        slug: 'hr',
        viewerRoleId: process.env.HR_ROLE_ID || null,
        pingTargetId: process.env.HR_ROLE_ID || null,
        categoryGroup: 'hr',
    },
    {
        key: 'physical_asset',
        label: 'Physical Asset Request',
        buttonEmoji: '📦',
        slug: 'asset-request',
        channelTag: 'PAR',
        viewerRoleId: process.env.ADMINS_ROLE_ID || null,
        pingTargetId: process.env.INVENTORY_ROLE_ID || null,
        categoryGroup: 'normal',
    },
    {
        key: 'misc',
        label: 'Miscellaneous',
        buttonEmoji: '❓',
        slug: 'misc',
        channelTag: 'MISC',
        viewerRoleId: process.env.ADMINS_ROLE_ID || null,
        pingTargetId: process.env.ADMINS_ROLE_ID || null,
        categoryGroup: 'normal',
    },
];

const typesStore = createJsonStore(path.join(__dirname, '../data/ticketTypes.json'), DEFAULT_TICKET_TYPES);

const EDITABLE_FIELDS = ['label', 'modalTitle', 'buttonEmoji', 'slug', 'channelTag', 'viewerRoleId', 'pingTargetId', 'categoryGroup'];
const VALID_CATEGORY_GROUPS = ['normal', 'hr'];

function loadTicketTypes() {
    return typesStore.load();
}

const TICKET_TYPES = loadTicketTypes();

function getTicketType(key) {
    return loadTicketTypes().find(t => t.key === key) || null;
}

function getTicketTypeBySlug(slug) {
    return loadTicketTypes().find(t => t.slug === slug) || null;
}

function slugifyKey(input) {
    return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function validateCategoryGroup(group) {
    return VALID_CATEGORY_GROUPS.includes(group) ? group : null;
}

function addTicketType(input) {
    const types = loadTicketTypes();

    const key = slugifyKey(input.key || input.label);
    if (!key) return { ok: false, error: 'Could not derive a valid key from the label/key provided.' };
    if (types.some(t => t.key === key)) return { ok: false, error: `A ticket type with key \`${key}\` already exists.` };

    const slug = slugifyKey(input.slug || key).replace(/_/g, '-');
    if (!slug) return { ok: false, error: 'Could not derive a valid slug.' };
    if (types.some(t => t.slug === slug)) return { ok: false, error: `A ticket type with slug \`${slug}\` already exists.` };

    const categoryGroup = validateCategoryGroup(input.categoryGroup) || 'normal';

    const type = {
        key,
        label: input.label || key,
        modalTitle: input.modalTitle || null,
        buttonEmoji: input.buttonEmoji || '🎫',
        slug,
        channelTag: input.channelTag || null,
        viewerRoleId: input.viewerRoleId || null,
        pingTargetId: input.pingTargetId || null,
        categoryGroup,
    };

    types.push(type);
    typesStore.save(types);
    return { ok: true, type };
}

function updateTicketType(key, patch) {
    const types = loadTicketTypes();
    const idx = types.findIndex(t => t.key === key);
    if (idx === -1) return { ok: false, error: `No ticket type with key \`${key}\` found.` };

    const next = { ...types[idx] };

    for (const field of EDITABLE_FIELDS) {
        if (patch[field] === undefined) continue;
        if (field === 'categoryGroup') {
            const group = validateCategoryGroup(patch.categoryGroup);
            if (!group) return { ok: false, error: `categoryGroup must be one of: ${VALID_CATEGORY_GROUPS.join(', ')}` };
            next.categoryGroup = group;
            continue;
        }
        if (field === 'slug') {
            const slug = slugifyKey(patch.slug).replace(/_/g, '-');
            if (!slug) return { ok: false, error: 'Could not derive a valid slug.' };
            if (types.some((t, i) => i !== idx && t.slug === slug)) return { ok: false, error: `A ticket type with slug \`${slug}\` already exists.` };
            next.slug = slug;
            continue;
        }
        next[field] = patch[field];
    }

    types[idx] = next;
    typesStore.save(types);
    return { ok: true, type: next };
}

function removeTicketType(key) {
    const types = loadTicketTypes();
    const idx = types.findIndex(t => t.key === key);
    if (idx === -1) return { ok: false, error: `No ticket type with key \`${key}\` found.` };

    const [removed] = types.splice(idx, 1);
    typesStore.save(types);
    return { ok: true, type: removed };
}

module.exports = {
    TICKET_TYPES,
    loadTicketTypes,
    getTicketType,
    getTicketTypeBySlug,
    addTicketType,
    updateTicketType,
    removeTicketType,
    VALID_CATEGORY_GROUPS,
};
