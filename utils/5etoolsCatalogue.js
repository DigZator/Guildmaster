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

// How much of a base weapon/armor's own gp value gets added on top of the
// rarity-tier default when pricing a synthesized magic variant combo.
// 1 = add 100% of base value. Tune freely; see previewVariantPricing.js.
const BASE_VALUE_PRICE_FACTOR = 1;


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

        rawType: raw.type ?? null,
        rawProperty: Array.isArray(raw.property) ? raw.property : null,
        rawWeaponOrArmor: !!(raw.weapon || raw.armor),
        weapon: !!raw.weapon, armor: !!raw.armor, sword: !!raw.sword, axe: !!raw.axe,
        bow: !!raw.bow, net: !!raw.net, arrow: !!raw.arrow, bolt: !!raw.bolt,
        polearm: !!raw.polearm, crossbow: !!raw.crossbow, spear: !!raw.spear,
        weaponCategory: raw.weaponCategory ?? null, dmgType: raw.dmgType ?? null,
        scfType: raw.scfType ?? null,
    };
}

function stripSource(code) {
    return typeof code === 'string' ? code.split('|')[0] : code;
}

function baseMatchesCondition(base, cond) {
    for (const [key, val] of Object.entries(cond)) {
        if (key === 'type') {
            if (stripSource(base.rawType) !== stripSource(val)) return false;
        } else if (key === 'property') {
            const props = (base.rawProperty ?? []).map(stripSource);
            if (!props.includes(stripSource(val))) return false;
        } else if (key === 'name') {
            if (base.name !== val) return false;
        } else if (key === 'source') {
            if (base.source !== val) return false;
        } else {
            if (base[key] !== val) return false;
        }
    }
    return true;
}

function itemMatchesTemplate(base, template) {
    const requires = template.requires ?? [];
    if (!requires.some(cond => baseMatchesCondition(base, cond))) return false;
    if (template.excludes && baseMatchesCondition(base, template.excludes)) return false;
    return true;
}

function normalizeVariantTemplate(raw, idx) {
    const inherits = raw.inherits ?? {};
    return {
        templateId: `${slugify(raw.name)}-${idx}`,
        name: raw.name,
        requires: raw.requires ?? [],
        excludes: raw.excludes ?? null,
        namePrefix: inherits.namePrefix ?? '',
        nameSuffix: inherits.nameSuffix ?? '',
        rarity: rarityName(inherits.rarity),
        requiresAttunement: !!inherits.reqAttune,
        description: Array.isArray(inherits.entries) ? inherits.entries.filter(e => typeof e === 'string').join(' ') : '',
        source: inherits.source ?? raw.source ?? null,
    };
}

function comboCode(naturalKey) {
    let h = 0;
    for (let i = 0; i < naturalKey.length; i++) {
        h = (Math.imul(31, h) + naturalKey.charCodeAt(i)) | 0;
    }
    return 'V' + Math.abs(h).toString(36).toUpperCase().padStart(5, '0').slice(0, 5);
}

let comboCache = null; // { byBaseCombos: [...] } built lazily, busted on sync

function invalidateComboCache() {
    comboCache = null;
    catalogueCache = null;
}

function buildComboCache() {
    const { items, variantTemplates } = loadCatalogue();
    const bases = items.filter(i => i.rawWeaponOrArmor);

    const byDisplayKey = new Map();

    for (const template of variantTemplates) {
        for (const base of bases) {
            if (!itemMatchesTemplate(base, template)) continue;

            const combinedName = `${template.namePrefix}${base.name}${template.nameSuffix}`;
            const displayKey = `${combinedName}::${base.naturalKey}`;
            
            if (byDisplayKey.has(displayKey)) continue;

            const naturalKey = `${base.naturalKey}::${template.templateId}`;
            const rarityDefault = DEFAULT_PRICE_BY_RARITY[template.rarity] ?? DEFAULT_PRICE_BY_RARITY.Common;
            const baseGp = base.priceGp ?? 0;
            const priceGp = Math.round((rarityDefault + baseGp * BASE_VALUE_PRICE_FACTOR) * 100) / 100;

            byDisplayKey.set(displayKey, {
                code: comboCode(naturalKey),
                naturalKey,
                name: combinedName,
                type: base.type,
                rarity: template.rarity,
                priceGp,
                isMagic: true,
                requiresAttunement: template.requiresAttunement,
                description: template.description,
                source: template.source ?? base.source,
                isVariantCombo: true,
            });
        }
    }

    return [...byDisplayKey.values()];
}

function getComboCache() {
    if (!comboCache) comboCache = buildComboCache();
    return comboCache;
}

let catalogueCache = null; // parsed catalogue.json, cached until next sync

function loadCatalogue() {
    if (catalogueCache) return catalogueCache;

    let data;
    try { data = JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8')); }
    catch { return { syncedAt: null, items: [], variantTemplates: [] }; }

    if (!Array.isArray(data.variantTemplates)) data.variantTemplates = [];

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

    catalogueCache = data;
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

    const variantsPath = path.join(DATA_DIR, 'magicvariants.json');
    let variantTemplates = [];
    if (fs.existsSync(variantsPath)) {
        const body = JSON.parse(fs.readFileSync(variantsPath, 'utf8'));
        variantTemplates = (body.magicvariant ?? [])
            .filter(raw => SOURCES.has(raw.inherits?.source))
            .map(normalizeVariantTemplate);
    } else {
        console.warn(`[5etoolsCatalogue] magicvariants.json not found at ${variantsPath} — skipping magic variant sync.`);
    }

    const catalogue = {
        syncedAt: new Date().toISOString(),
        sources: [...SOURCES],
        items: Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name)),
        variantTemplates,
    };
    fs.writeFileSync(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2));
    invalidateComboCache();
    return { count: catalogue.items.length, variantTemplateCount: variantTemplates.length, syncedAt: catalogue.syncedAt };
}

function searchCatalogue(query, { limit = 100 } = {}) {
    const q = query.toLowerCase();
    const results = [];

    for (const item of loadCatalogue().items) {
        if (results.length >= limit) return results;
        if (item.name.toLowerCase().includes(q)) results.push(item);
    }

    for (const combo of getComboCache()) {
        if (results.length >= limit) return results;
        if (combo.name.toLowerCase().includes(q)) results.push(combo);
    }

    return results;
}

function getCatalogueItemByName(name) {
    const target = name.trim().toLowerCase();
    const matches = [
        ...loadCatalogue().items.filter(i => i.name.toLowerCase() === target),
        ...getComboCache().filter(c => c.name.toLowerCase() === target),
    ];
    if (matches.length === 0) return null;
    return matches.reduce((cheapest, item) => {
        if (item.priceGp == null) return cheapest;
        if (cheapest == null || cheapest.priceGp == null) return item;
        return item.priceGp < cheapest.priceGp ? item : cheapest;
    }, null) ?? matches[0];
}

function getCatalogueItemByCode(code) {
    const c = code.trim().toUpperCase();
    const found = loadCatalogue().items.find(i => i.code === c);
    if (found) return found;
    return getComboCache().find(combo => combo.code === c) ?? null;
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
    invalidateComboCache,

    RESTOCK_CADENCE_MS, RESTOCK_QTY_BY_RARITY, DEFAULT_PRICE_BY_RARITY, BASE_VALUE_PRICE_FACTOR,
};
