const fs = require('fs');
const path = require('path');

const ALLOWED_SOURCES = new Set(['XPHB', 'XDMG', 'XMM', 'EFA', 'FRAiF', 'FRHoF', 'LFL', 'RHW']);

const CATEGORY_TYPE_MAP = {
    toolArtisan: 'AT',
    setGaming: 'GS',
    instrumentMusical: 'INS',
};

const INFORMATIONAL_ONLY = {
    Spellbook: 'You also have a spellbook (contains your known 1st-level spells) — not tracked as inventory.',
};

function stripTags(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\{@\w+\s+([^|}]+)(\|[^}]*)?\}/g, '$1').trim();
}

function describeEntry(raw) {
    if (typeof raw === 'string') {
        return { kind: 'item', raw: stripTags(raw), displayName: stripTags(raw).split('|')[0], quantity: 1 };
    }
    if (raw && typeof raw === 'object') {
        if ('equipmentTypes' in raw) {
            return { kind: 'categoryChoice', types: raw.equipmentTypes, quantity: raw.quantity ?? 1 };
        }
        if ('equipmentType' in raw) {
            return { kind: 'category', type: raw.equipmentType, quantity: raw.quantity ?? 1 };
        }
        if ('value' in raw) {
            return { kind: 'gold', cp: raw.value };
        }
        if ('item' in raw) {
            const name = stripTags(raw.item);
            return {
                kind: 'item',
                raw: name,
                displayName: raw.displayName ? stripTags(raw.displayName) : name.split('|')[0],
                quantity: raw.quantity ?? 1,
            };
        }
        if ('special' in raw) {
            if (INFORMATIONAL_ONLY[raw.special]) {
                return { kind: 'informational', label: raw.special, note: INFORMATIONAL_ONLY[raw.special] };
            }
            return { kind: 'skipFlag', label: raw.special, quantity: raw.quantity ?? 1 };
        }
    }
    return { kind: 'unknown', raw };
}

function normalizeChoiceGroups(rawGroups) {
    const group = rawGroups[0] || {};
    return Object.entries(group).map(([optionKey, entries]) => ({
        optionKey,
        entries: entries.map(describeEntry),
    }));
}

const CATEGORY_FRIENDLY_NAME = {
    toolArtisan: "artisan's tool",
    setGaming: 'gaming set',
    instrumentMusical: 'musical instrument',
};

function friendlyCategory(code) {
    return CATEGORY_FRIENDLY_NAME[code] ?? code;
}

function previewText(options, maxLen = 70) {
    const first = options[0];
    if (!first) return '';
    const parts = first.entries.map(e => {
        if (e.kind === 'item') return e.quantity > 1 ? `${e.displayName} x${e.quantity}` : e.displayName;
        if (e.kind === 'gold') return `${(e.cp / 100).toFixed(0)}gp`;
        if (e.kind === 'category') return `(choice of ${friendlyCategory(e.type)})`;
        if (e.kind === 'categoryChoice') return `(choice of ${e.types.map(friendlyCategory).join(' or ')})`;
        if (e.kind === 'informational') return e.label;
        return null;
    }).filter(Boolean);

    let text = parts.join(', ');
    if (text.length > maxLen) text = text.slice(0, maxLen - 1) + '…';
    return text;
}

function loadClasses(dataDir) {
    const classDir = path.join(dataDir, 'class');
    const files = fs.readdirSync(classDir).filter(f => f.startsWith('class-') && f.endsWith('.json'));
    const out = [];

    for (const file of files) {
        let data;
        try {
            data = JSON.parse(fs.readFileSync(path.join(classDir, file), 'utf8'));
        } catch {
            continue;
        }
        for (const cls of (data.class || [])) {
            if (!ALLOWED_SOURCES.has(cls.source)) continue;
            const se = cls.startingEquipment;
            if (!se || !se.defaultData) continue;

            const options = normalizeChoiceGroups(se.defaultData);
            out.push({
                key: cls.name.toLowerCase(),
                name: cls.name,
                source: cls.source,
                options,
                preview: previewText(options),
            });
        }
    }
    return out;
}

function loadBackgrounds(dataDir) {
    const file = path.join(dataDir, 'backgrounds.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = [];

    for (const bg of (data.background || [])) {
        if (!ALLOWED_SOURCES.has(bg.source)) continue;
        const se = bg.startingEquipment;
        if (!se) continue;

        const options = normalizeChoiceGroups(se);
        out.push({
            key: bg.name.toLowerCase(),
            name: bg.name,
            source: bg.source,
            options,
            preview: previewText(options),
        });
    }
    return out;
}

function loadCategoryIndex(dataDir) {
    const file = path.join(dataDir, 'items.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const groups = (data.itemGroup || []).concat(data.item || []);
    const index = {};

    for (const g of groups) {
        if (!Array.isArray(g.items)) continue;
        if (g.source !== 'XPHB') continue;
        if (!g.type) continue;
        const prefix = g.type.split('|')[0];
        index[prefix] = { name: g.name, items: g.items };
    }
    return index;
}

function resolveCategory(categoryIndex, equipmentTypeCode) {
    const prefix = CATEGORY_TYPE_MAP[equipmentTypeCode];
    if (!prefix) return null;
    const group = categoryIndex[prefix];
    if (!group) return null;
    return {
        categoryName: group.name,
        options: group.items.map(raw => ({ raw, displayName: raw.split('|')[0] })),
    };
}

module.exports = {
    ALLOWED_SOURCES,
    CATEGORY_TYPE_MAP,
    loadClasses,
    loadBackgrounds,
    loadCategoryIndex,
    resolveCategory,
    describeEntry,
    previewText,
};
