const fs = require('fs');
const path = require('path');

const BLUEPRINTS_PATH = path.join(__dirname, '..', 'data', 'downtimeBlueprints.json');
const SEQUENCE_PATH    = path.join(__dirname, '..', 'data', 'downtimeSequence.json');

function loadBlueprints() {
    return JSON.parse(fs.readFileSync(BLUEPRINTS_PATH, 'utf8')).blueprints;
}

function getBlueprint(activityId) {
    return loadBlueprints()[activityId] ?? null;
}

// Get blueprint and tier directly from UID (no separate params needed)
function getBlueprintById(UID) {
    const bp = loadBlueprints();
    const firstLetter = UID.charAt(0).toUpperCase();
    
    // Stage 1: Find blueprints matching the first letter
    const matchingByFirstLetter = [];
    for (const key in bp) {
        if (key.charAt(0).toUpperCase() === firstLetter) {
            matchingByFirstLetter.push({ key, blueprint: bp[key] });
        }
    }
    
    // Stage 2: Check tiers within matching blueprints for second character match
    const secondChar = UID.charAt(1)?.toUpperCase();
    for (const { key, blueprint } of matchingByFirstLetter) {
        if (blueprint.tiers) {
            for (const tier of blueprint.tiers) {
                if (tier.value !== undefined && String(tier.value).charAt(0).toUpperCase() === secondChar) {
                    return { key, blueprint, tier };
                }
            }
        }
    }
    
    return null;
}

function nextDtaId() {
    let used = [];
    try { used = JSON.parse(fs.readFileSync(SEQUENCE_PATH, 'utf8')).used; } catch {}
    const usedSet = new Set(used);
    let n = 0;
    while (usedSet.has(n.toString(16).toUpperCase().padStart(4, '0'))) n++;
    const id = n.toString(16).toUpperCase().padStart(4, '0');
    usedSet.add(id);
    fs.mkdirSync(path.dirname(SEQUENCE_PATH), { recursive: true });
    fs.writeFileSync(SEQUENCE_PATH, JSON.stringify({ used: [...usedSet] }, null, 2));
    return id;
}

const REFERENCE_COST_FNS = {
    spellScribingCost: (params) => Math.max(1, params.spellLevel || 0) * 50,
};

function getParamName(blueprint) {
    return blueprint.parameter || blueprint.paramName || null;
}

function sumCosts(costs, params) {
    let gpTotal = 0;
    let gpPerDay = 0;
    for (const c of costs || []) {
        if (c.target === 'assistant') continue;
        switch (c.type) {
            case 'gp':       gpTotal += c.value; break;
            case 'sp':       gpTotal += c.value / 10; break;
            case 'cp':       gpTotal += c.value / 100; break;
            case 'gpPerDay': gpPerDay += c.value; break;
            case 'spPerDay': gpPerDay += c.value / 10; break;
            case 'cpPerDay': gpPerDay += c.value / 100; break;
            case 'reference': {
                const fn = REFERENCE_COST_FNS[c.key];
                if (fn) gpTotal += fn(params);
                break;
            }
        }
    }
    return { gpTotal, gpPerDay };
}

function findTier(tiers, val) {
    if (!tiers) return null;
    const exact = tiers.find(t => t.value !== undefined && String(t.value) === String(val));
    if (exact) return exact;
    return tiers.find(t => {
        const min = t.min ?? t.minLevel;
        const max = t.max ?? t.maxLevel;
        if (min == null && max == null) return false;
        if (min != null && val < min) return false;
        if (max != null && val > max) return false;
        return true;
    }) ?? null;
}

function resolveCost(blueprint, params = {}) {
    let daysRequired, costs, tierValue = null;

    if (blueprint.costModel === 'parameterized') {
        const paramName = getParamName(blueprint);
        const val = params[paramName];
        const tier = findTier(blueprint.tiers, val);
        if (!tier) return null;
        daysRequired = tier.daysRequired;
        costs = tier.costs ?? (tier.flatGp != null ? [{ type: 'gp', value: tier.flatGp }] : []);
        tierValue = tier.value ?? val;
    } else if (blueprint.costModel === 'flat' || blueprint.costModel === 'perDay') {
        daysRequired = blueprint.daysRequired;
        costs = blueprint.costs ?? [
            ...(blueprint.flatGp != null ? [{ type: 'gp', value: blueprint.flatGp }] : []),
            ...(blueprint.gpPerDay != null ? [{ type: 'gpPerDay', value: blueprint.gpPerDay }] : []),
        ];
    } else {
        return null;
    }

    const { gpTotal, gpPerDay } = sumCosts(costs, params);
    const finalGpTotal = gpTotal + (gpPerDay ? gpPerDay * daysRequired : 0);

    return {
        daysRequired,
        gpTotal: finalGpTotal,
        gpPerDay: gpPerDay || (daysRequired ? finalGpTotal / daysRequired : 0),
        tierValue,
    };
}

// Resolve cost from UID directly (tier is embedded in the UID)
function resolveCostFromUID(UID, params = {}) {
    const result = getBlueprintById(UID);
    if (!result) return null;
    
    const { key, blueprint, tier } = result;
    
    // Special handling for "catch-up" - requires additional validation
    if (key.toLowerCase() === 'catch-up' || blueprint.costModel === 'catch-up') {
        // catch-up needs real parameter checks
        if (!params.currentLevel || !params.targetLevel) {
            throw new Error('catch-up activity requires currentLevel and targetLevel parameters');
        }
        // Validate parameters as needed
        if (params.targetLevel <= params.currentLevel) {
            throw new Error('targetLevel must be greater than currentLevel');
        }
    }
    
    // If tier exists, use its cost data directly
    if (tier) {
        const daysRequired = tier.daysRequired;
        const costs = tier.costs ?? (tier.flatGp != null ? [{ type: 'gp', value: tier.flatGp }] : []);
        const { gpTotal, gpPerDay } = sumCosts(costs, params);
        const finalGpTotal = gpTotal + (gpPerDay ? gpPerDay * daysRequired : 0);
        
        return {
            daysRequired,
            gpTotal: finalGpTotal,
            gpPerDay: gpPerDay || (daysRequired ? finalGpTotal / daysRequired : 0),
            tierValue: tier.value ?? null,
        };
    }
    
    return null;
}

async function applyDowntimeOutput({ output, characterPageId, activityName, tierValue }, notion) {
    if (!output) return null;

    switch (output.type) {
        case 'item':
        case 'spellScroll':
        case 'magicItem': {
            const itemName = output.type === 'item'
                ? (output.grants || activityName)
                : `${activityName}${tierValue ? ` (${tierValue})` : ''}`;
            await notion.createInventoryItem({
                itemName,
                characterPageId,
                rarity: output.type === 'item' ? 'Common' : (typeof tierValue === 'string' ? tierValue : 'Common'),
                type: output.type === 'spellScroll' ? 'Scroll' : (output.type === 'magicItem' ? 'Magic Item' : 'Item'),
                source: 'Downtime',
                notes: `Auto-granted from downtime activity: ${activityName}`,
            });
            return `Granted item: ${itemName}`;
        }
        case 'level': {
            const char = await notion.getPageById(characterPageId);
            const currentLevel = char.properties['Level']?.number ?? 1;
            await notion.setCharacterLevel(characterPageId, currentLevel + 1);
            return `Level increased to ${currentLevel + 1}`;
        }
        case 'language':
        case 'proficiency':
        case 'spellbookEntry': {
            const char = await notion.getPageById(characterPageId);
            const existingNotes = char.properties['Notes']?.rich_text?.[0]?.plain_text ?? '';
            const label = output.type === 'language' ? 'Language' : output.type === 'proficiency' ? 'Proficiency' : 'Spellbook Entry';
            const entry = `${label} gained (${activityName}${tierValue ? `, ${tierValue}` : ''})`;
            await notion.updatePageProperty(characterPageId, {
                'Notes': { rich_text: [{ text: { content: existingNotes ? `${existingNotes}\n${entry}` : entry } }] },
            });
            return entry;
        }
        default:
            return null;
    }
}

module.exports = { loadBlueprints, getBlueprint, getBlueprintById, nextDtaId, resolveCost, resolveCostFromUID, applyDowntimeOutput, getParamName };
