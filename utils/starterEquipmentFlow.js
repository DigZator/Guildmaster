const { resolveCategory } = require('./starterEquipmentData');
const { getCatalogueItemByName, inferSubtype } = require('./5etoolsCatalogue');

const TYPE_KEYWORDS = [
    [/armor|mail|leather|shield/i, 'Armor'],
    [/sword|axe|mace|dagger|bow|crossbow|spear|hammer|flail|javelin|quarterstaff|sling|dart|whip|pick|lance|trident|halberd|glaive/i, 'Weapon'],
    [/pack$|pack\)/i, 'Pack'],
    [/arrows|bolts|bullets|needles/i, 'Ammunition'],
    [/tools|supplies|kit|instrument/i, 'Tool'],
];

function resolveInventoryItem(rawName, quantity) {
    const catalogueItem = getCatalogueItemByName(rawName);
    if (catalogueItem) {
        return {
            displayName: catalogueItem.name,
            quantity,
            type: catalogueItem.type,
            subtype: inferSubtype(catalogueItem),
        };
    }
    return {
        displayName: rawName,
        quantity,
        type: inferType(rawName),
        subtype: null,
    };
}

function inferType(name) {
    for (const [regex, type] of TYPE_KEYWORDS) {
        if (regex.test(name)) return type;
    }
    return 'Gear';
}

function buildInitialSession({ classData, backgroundData, categoryIndex, characterId, characterName }) {
    const steps = [
        { type: 'chooseOption', source: `${classData.name} (Class)`, options: classData.options },
        { type: 'chooseOption', source: `${backgroundData.name} (Background)`, options: backgroundData.options },
    ];

    return {
        characterId,
        characterName,
        categoryIndex,
        steps,
        resolved: {
            items: [],
            goldCp: 0,
            informational: [], 
            skipped: [],       
        },
    };
}

function currentStep(session) {
    return session.steps[0] ?? null;
}

function applyPick(session, pickIndex) {
    const step = session.steps.shift();
    if (!step) return session;

    if (step.type === 'chooseOption') {
        const chosen = step.options[pickIndex];
        if (!chosen) throw new Error('Invalid pick index for chooseOption step');

        const newSteps = [];
        for (const entry of chosen.entries) {
            switch (entry.kind) {
                case 'item':
                    session.resolved.items.push(resolveInventoryItem(entry.displayName, entry.quantity));
                    break;
                case 'gold':
                    session.resolved.goldCp += entry.cp;
                    break;
                case 'informational':
                    session.resolved.informational.push({ label: entry.label, note: entry.note });
                    break;
                case 'category': {
                    const resolved = resolveCategory(session.categoryIndex, entry.type);
                    if (resolved) {
                        newSteps.push({
                            type: 'chooseCategoryItem',
                            source: resolved.categoryName,
                            quantity: entry.quantity,
                            options: resolved.options,
                        });
                    } else {
                        session.resolved.skipped.push({ label: entry.type });
                    }
                    break;
                }
                case 'categoryChoice': {
                    newSteps.push({
                        type: 'chooseCategoryGroup',
                        source: 'Choose a category',
                        quantity: entry.quantity,
                        types: entry.types,
                    });
                    break;
                }
                case 'skipFlag':
                    session.resolved.skipped.push({ label: entry.label });
                    break;
                default:
                    break;
            }
        }
        session.steps.unshift(...newSteps);
        return session;
    }

    if (step.type === 'chooseCategoryGroup') {
        const chosenType = step.types[pickIndex];
        if (!chosenType) throw new Error('Invalid pick index for chooseCategoryGroup step');

        const resolved = resolveCategory(session.categoryIndex, chosenType);
        if (resolved) {
            session.steps.unshift({
                type: 'chooseCategoryItem',
                source: resolved.categoryName,
                quantity: step.quantity,
                options: resolved.options,
            });
        } else {
            session.resolved.skipped.push({ label: chosenType });
        }
        return session;
    }

    if (step.type === 'chooseCategoryItem') {
        const chosen = step.options[pickIndex];
        if (!chosen) throw new Error('Invalid pick index for chooseCategoryItem step');
    
        session.resolved.items.push(resolveInventoryItem(chosen.displayName, step.quantity));
        return session;
    }

    throw new Error(`Unknown step type: ${step.type}`);
}

function isComplete(session) {
    return session.steps.length === 0;
}

module.exports = { buildInitialSession, currentStep, applyPick, isComplete, inferType };
