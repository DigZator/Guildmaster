const fs = require('fs');
const path = require('path');
const { SOURCES: SOURCES_LIST } = require('../config/dndSources');

const DATA_DIR = path.join(process.env.HOME, '5etools-src', 'data', 'spells');
const SPELLS_PATH = path.join(__dirname, '..', 'data', 'spells.json');

const SOURCES = new Set(SOURCES_LIST);

const SCHOOL_NAMES = {
    A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment',
    V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation',
};

function hexCode(n) { return n.toString(16).toUpperCase().padStart(3, '0'); }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function schoolName(raw) { return SCHOOL_NAMES[raw] ?? raw ?? 'Unknown'; }

function normalizeEntry(raw, existingCodeByKey, nextCodeRef) {
    const naturalKey = `${slugify(raw.name)}_${raw.source}`;
    let code = existingCodeByKey.get(naturalKey);
    if (!code) code = hexCode(nextCodeRef.value++);

    return {
        code, naturalKey,
        name: raw.name,
        level: raw.level ?? 0,
        school: schoolName(raw.school),
        source: raw.source,
        ritual: !!raw.meta?.ritual,
        concentration: Array.isArray(raw.duration) ? raw.duration.some(d => d?.concentration) : false,
    };
}

let spellsCache = null;

function loadSpells() {
    if (spellsCache) return spellsCache;
    try {
        spellsCache = JSON.parse(fs.readFileSync(SPELLS_PATH, 'utf8'));
    } catch {
        spellsCache = { syncedAt: null, spells: [] };
    }
    return spellsCache;
}

function invalidateSpellCache() {
    spellsCache = null;
}

async function syncSpells() {
    const prior = loadSpells();
    const existingCodeByKey = new Map((prior.spells ?? []).map(s => [s.naturalKey, s.code]));
    const usedCodes = new Set((prior.spells ?? []).map(s => s.code));
    let n = 0; while (usedCodes.has(hexCode(n))) n++;
    const nextCodeRef = { value: n };

    if (!fs.existsSync(DATA_DIR)) {
        throw new Error(`5etools spell data not found: ${DATA_DIR}. Did you clone/update ~/5etools-src?`);
    }

    const raws = [];
    for (const file of fs.readdirSync(DATA_DIR)) {
        if (!file.startsWith('spells-') || !file.endsWith('.json')) continue;
        const filePath = path.join(DATA_DIR, file);
        const body = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        raws.push(...(body.spell ?? []));
    }

    const filtered = raws.filter(r => SOURCES.has(r.source));
    const byKey = new Map();
    for (const raw of filtered) {
        const normalized = normalizeEntry(raw, existingCodeByKey, nextCodeRef);
        byKey.set(normalized.naturalKey, normalized);
    }

    const data = {
        syncedAt: new Date().toISOString(),
        sources: [...SOURCES],
        spells: Array.from(byKey.values()).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    };
    fs.writeFileSync(SPELLS_PATH, JSON.stringify(data, null, 2));
    invalidateSpellCache();
    return { count: data.spells.length, syncedAt: data.syncedAt };
}

function searchSpells(query, { level = null, limit = 25 } = {}) {
    const q = (query ?? '').toLowerCase();
    const results = [];
    for (const spell of loadSpells().spells ?? []) {
        if (results.length >= limit) break;
        if (level != null && spell.level !== level) continue;
        if (q && !spell.name.toLowerCase().includes(q)) continue;
        results.push(spell);
    }
    return results;
}

function getSpellByCode(code) {
    const c = (code ?? '').trim().toUpperCase();
    return (loadSpells().spells ?? []).find(s => s.code === c) ?? null;
}

function getSpellByName(name) {
    const target = (name ?? '').trim().toLowerCase();
    return (loadSpells().spells ?? []).find(s => s.name.toLowerCase() === target) ?? null;
}

function getSpellsMeta() {
    const { syncedAt, spells } = loadSpells();
    return { syncedAt, count: (spells ?? []).length };
}

module.exports = {
    syncSpells, loadSpells, searchSpells, getSpellByCode, getSpellByName, getSpellsMeta, invalidateSpellCache,
    SOURCES,
};
