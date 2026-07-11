const fs = require('fs');
const path = require('path');
const { getCatalogueItemByCode, restockQtyFor, restockCadenceMsFor, defaultPriceFor } = require('./5etoolsCatalogue');

const FLOOR_PATH     = path.join(__dirname, '..', 'data', 'shopFloor.json');
const OVERRIDES_PATH = path.join(__dirname, '..', 'data', 'priceOverrides.json');

const TIER_MIN_BY_RARITY = { Common: 1, Uncommon: 1, Rare: 2, 'Very Rare': 3, Legendary: 4 };
function tierMinFor(rarity) { return TIER_MIN_BY_RARITY[rarity] ?? 1; }

function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function saveJson(p, data) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data, null, 2)); }

function getPriceOverride(code) { return loadJson(OVERRIDES_PATH)[code] ?? null; }
function setPriceOverride(code, price) {
    const overrides = loadJson(OVERRIDES_PATH);
    overrides[code] = price;
    saveJson(OVERRIDES_PATH, overrides);
}

function resolvePrice(code, catalogueItem, explicitPrice) {
    const price = explicitPrice ?? getPriceOverride(code) ?? catalogueItem.priceGp ?? defaultPriceFor(catalogueItem.rarity);
    if (explicitPrice != null) setPriceOverride(code, price);
    return price;
}

function getShopFloor() { return loadJson(FLOOR_PATH); }

function getShopEntry(code) {
    const floor = getShopFloor();
    const entry = floor[code.toUpperCase()];
    if (!entry) return null;
    const catalogueItem = getCatalogueItemByCode(code);
    if (!catalogueItem) return null;
    return { code: code.toUpperCase(), ...catalogueItem, ...entry };
}

function getAllStockedEntries({ availableOnly = true } = {}) {
    const floor = getShopFloor();
    const out = [];
    for (const [code, entry] of Object.entries(floor)) {
        if (availableOnly && !entry.available) continue;
        const catalogueItem = getCatalogueItemByCode(code);
        if (catalogueItem) out.push({ code, ...catalogueItem, ...entry });
    }
    return out;
}

function stockItem(code, { quantity, price } = {}) {
    const catalogueItem = getCatalogueItemByCode(code);
    if (!catalogueItem) return null;
    const c = code.toUpperCase();
    const qty = quantity ?? restockQtyFor(catalogueItem.rarity);
    const finalPrice = resolvePrice(c, catalogueItem, price);

    const floor = getShopFloor();
    floor[c] = {
        quantity: qty,
        restockQuantity: qty,
        price: finalPrice,
        lastRestocked: new Date().toISOString(),
        available: qty > 0,
    };
    saveJson(FLOOR_PATH, floor);
    return { ...catalogueItem, code: c, ...floor[c] };
}

function unstockItem(code) {
    const floor = getShopFloor();
    const c = code.toUpperCase();
    if (!floor[c]) return null;
    floor[c].available = false;
    saveJson(FLOOR_PATH, floor);
    return floor[c];
}

function restockItem(code) {
    const floor = getShopFloor();
    const c = code.toUpperCase();
    if (!floor[c]) return null;
    floor[c].quantity = floor[c].restockQuantity;
    floor[c].available = floor[c].quantity > 0;
    floor[c].lastRestocked = new Date().toISOString();
    saveJson(FLOOR_PATH, floor);
    return floor[c];
}

function decrementStock(code) {
    const floor = getShopFloor();
    const c = code.toUpperCase();
    if (!floor[c] || floor[c].quantity <= 0) return null;
    floor[c].quantity -= 1;
    if (floor[c].quantity === 0) floor[c].available = false;
    saveJson(FLOOR_PATH, floor);
    return floor[c];
}

function runRestockCheck() {
    const floor = getShopFloor();
    const restocked = [];
    for (const [code, entry] of Object.entries(floor)) {
        const catalogueItem = getCatalogueItemByCode(code);
        if (!catalogueItem) continue;
        const due = Date.now() - new Date(entry.lastRestocked).getTime() >= restockCadenceMsFor(catalogueItem.rarity);
        if (due && entry.quantity < entry.restockQuantity) {
            entry.quantity = entry.restockQuantity;
            entry.available = true;
            entry.lastRestocked = new Date().toISOString();
            restocked.push({ code, name: catalogueItem.name });
        }
    }
    saveJson(FLOOR_PATH, floor);
    return restocked;
}

module.exports = {
    tierMinFor, getShopEntry, getAllStockedEntries, stockItem, unstockItem, restockItem,
    decrementStock, runRestockCheck, getPriceOverride, setPriceOverride,
};
