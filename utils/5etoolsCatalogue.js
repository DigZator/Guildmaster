const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(process.env.HOME, '5etools-src', 'data');

const CATALOGUE_PATH = path.join(__dirname, '..', 'data', 'catalogue.json');
const BASE_URL = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data';
const SOURCES = new Set(['XPHB', 'XDMG', 'XMM', 'EFA',
						 'FRAiF', 'FRHoF', 'LFL', 'RHW']);

const TYPE_NAMES = {
    A: 'Armor', S: 'Shield', W: 'Weapon', AT: 'Tool', T: 'Tool', G: 'Adventuring Gear',
    P: 'Potion', SC: 'Scroll', RD: 'Rod', RG: 'Ring', WD: 'Wand', ST: 'Staff',
    INS: 'Instrument', GS: 'Gaming Set', M: 'Melee Weapon', R: 'Ranged Weapon',
    AF: 'Ammunition', $: 'Treasure', TG: 'Trade Good', VEH: 'Vehicle',
};

const RARITY_NAMES = {
    none: 'Common', common: 'Common', uncommon: 'Uncommon',
    rare: 'Rare', 'very rare': 'Very Rare', legendary: 'Legendary',
    artifact: 'Legendary', unknown: 'Common', varies: 'Common',
};

const SUBTYPE_BY_TYPE_NAME = { Potion: 'Potion', 'Spell Scroll': 'Spell Scroll', Ammunition: 'Ammo' };

const RESTOCK_QTY_BY_RARITY = { 
	Common: 128, Uncommon: 64, 
	Rare: 16, 'Very Rare': 4, 
	Legendary: 1
};

const RESTOCK_CADENCE_MS = {
    Common: 864e5, Uncommon: 6048e5, 
    Rare: 2592e6, 'Very Rare': 7862e6, 
    Legendary: 31536e6,
};

const DEFAULT_PRICE_BY_RARITY = { 
	Common: 75, Uncommon: 400,
	Rare: 4000, 'Very Rare': 40000,
	Legendary: 100000
};


function typeName(raw) {
    if (raw.type) {
        const prefix = raw.type.split('|')[0];
        return TYPE_NAMES[prefix] ?? raw.type;
    }
    if (raw.wondrous) return 'Wondrous Item';
    if (raw.staff)    return 'Staff';
    if (raw.rod)      return 'Rod';
    if (raw.wand)     return 'Wand';
    if (raw.ring)     return 'Ring';
    if (raw.weapon)   return 'Weapon';
    if (raw.armor)    return 'Armor';
    return 'Gear';
}

function hexCode(n) { return n.toString(16).toUpperCase().padStart(3, '0'); }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function rarityName(raw) { return RARITY_NAMES[String(raw ?? 'none').toLowerCase()] ?? 'Common'; }
function priceGpFrom(entry) { return entry.value != null ? entry.value / 100 : null; }
function inferSubtype(catalogueItem) { return SUBTYPE_BY_TYPE_NAME[catalogueItem.type] ?? null; }

function normalizeLegacyType(rawType) {
    if (typeof rawType !== 'string' || !rawType.includes('|')) return rawType;
    const prefix = rawType.split('|')[0];
    return TYPE_NAMES[prefix] ?? rawType;
}

function normalizeEntry(raw, existingCodeByKey, nextCodeRef) {
    const naturalKey = `${slugify(raw.name)}_${raw.source}`;
    let code = existingCodeByKey.get(naturalKey);
    if (!code) code = hexCode(nextCodeRef.value++);

    return {
        code, naturalKey,
        name: raw.name,
        type: typeName(raw),
        rarity: rarityName(raw.rarity),
        priceGp: priceGpFrom(raw),
        isMagic: !!raw.reqAttune || (raw.rarity && raw.rarity !== 'none'),
        requiresAttunement: !!raw.reqAttune,
        description: Array.isArray(raw.entries) ? raw.entries.filter(e => typeof e === 'string').join(' ') : '',
        source: raw.source,
    };
}
function loadCatalogue() {
    let data;
    try { data = JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8')); }
    catch { return { syncedAt: null, items: [] }; }

    let healed = false;
    for (const item of data.items) {
        const fixed = normalizeLegacyType(item.type);
        if (fixed !== item.type) {
            item.type = fixed;
            healed = true;
        }
    }
    if (healed) {
        try { fs.writeFileSync(CATALOGUE_PATH, JSON.stringify(data, null, 2)); }
        catch (err) { console.warn('[5etoolsCatalogue] Could not persist self-healed types:', err); }
    }

    return data;
}

async function syncCatalogue() {
    const prior = loadCatalogue();
    const existingCodeByKey = new Map(prior.items.map(i => [i.naturalKey, i.code]));
    const usedCodes = new Set(prior.items.map(i => i.code));
    let n = 0; while (usedCodes.has(hexCode(n))) n++;
    const nextCodeRef = { value: n };

    const files = ['items-base.json', 'items.json'];
    const raws = [];
    for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        if (!fs.existsSync(filePath)) throw new Error(`5etools data not found: ${filePath}. Did you clone/update ~/5etools-src?`);
        const body = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        raws.push(...(body.baseitem ?? []), ...(body.item ?? []));
    }

    const filtered = raws.filter(r => SOURCES.has(r.source));
    const byKey = new Map();
    for (const raw of filtered) {
        const normalized = normalizeEntry(raw, existingCodeByKey, nextCodeRef);
        byKey.set(normalized.naturalKey, normalized);
    }

    const catalogue = {
        syncedAt: new Date().toISOString(),
        sources: [...SOURCES],
        items: Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name)),
    };
    fs.writeFileSync(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2));
    return { count: catalogue.items.length, syncedAt: catalogue.syncedAt };
}

function searchCatalogue(query, { limit = 100 } = {}) {
    const q = query.toLowerCase();
    return loadCatalogue().items.filter(i => i.name.toLowerCase().includes(q)).slice(0, limit);
}

function getCatalogueItemByName(name) {
    const target = name.trim().toLowerCase();
    const matches = loadCatalogue().items.filter(i => i.name.toLowerCase() === target);
    if (matches.length === 0) return null;
    return matches.reduce((cheapest, item) => {
        if (item.priceGp == null) return cheapest;
        if (cheapest == null || cheapest.priceGp == null) return item;
        return item.priceGp < cheapest.priceGp ? item : cheapest;
    }, null) ?? matches[0];
}

function getCatalogueItemByCode(code) {
    const c = code.trim().toUpperCase();
    return loadCatalogue().items.find(i => i.code === c) ?? null;
}

function getCatalogueMeta() {
    const { syncedAt, items } = loadCatalogue();
    return { syncedAt, count: items.length };
}

function restockCadenceMsFor(rarity) { return RESTOCK_CADENCE_MS[rarity] ?? RESTOCK_CADENCE_MS.Common; }
function restockQtyFor(rarity) { return RESTOCK_QTY_BY_RARITY[rarity] ?? RESTOCK_QTY_BY_RARITY.Common; }
function defaultPriceFor(rarity) { return DEFAULT_PRICE_BY_RARITY[rarity] ?? DEFAULT_PRICE_BY_RARITY.Common; }

module.exports = {
    syncCatalogue, loadCatalogue, searchCatalogue, getCatalogueItemByCode, 
    getCatalogueItemByName, getCatalogueMeta,
    restockCadenceMsFor, restockQtyFor, defaultPriceFor,inferSubtype,

    RESTOCK_CADENCE_MS, RESTOCK_QTY_BY_RARITY, DEFAULT_PRICE_BY_RARITY,
};
