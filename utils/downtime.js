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

// Resolves a blueprint + player params into a concrete { daysRequired, gpTotal, tier }
function resolveCost(blueprint, params = {}) {
    switch (blueprint.costModel) {
        case 'perDay':
            return { daysRequired: blueprint.daysRequired, gpPerDay: blueprint.gpPerDay, gpTotal: null };
        case 'flat':
            return { daysRequired: blueprint.daysRequired, gpTotal: blueprint.flatGp };
        case 'parameterized': {
            const val = params[blueprint.paramName];
            const tier = blueprint.tiers.find(t =>
                (t.maxLevel == null || val <= t.maxLevel) &&
                (t.minLevel == null || val >= t.minLevel)
            );
            if (!tier) return null;
            return { daysRequired: tier.daysRequired, gpTotal: tier.flatGp, tier };
        }
        default:
            return null;
    }
}

module.exports = { loadBlueprints, getBlueprint, nextDtaId, resolveCost };
