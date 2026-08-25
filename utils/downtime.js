const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { adjustCharacterNumbersUnlocked, setCharacterLevel, withPageLock, getPageById } = require('./leagueNotion');
const { resolveLevelUps, LEVEL_CONFIG } = require('../config/leagueLeveling');
const { getCatalogueItemByName, inferSubtype } = require('./5etoolsCatalogue');

const BLUEPRINTS_PATH = path.join(__dirname, '..', 'data', 'downtimeBlueprints.json');
const SEQUENCE_PATH    = path.join(__dirname, '..', 'data', 'downtimeSequence.json');
const QUOTES_PATH      = path.join(__dirname, '..', 'data', 'downtimeQuotes.json');

const TIER_COLORS = [0xe74c3c, 0x3498db, 0x9b59b6, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x1abc9c];

let quotesCache = null;

function loadQuotes() {
    if (quotesCache) return quotesCache;
    try {
        quotesCache = JSON.parse(fs.readFileSync(QUOTES_PATH, 'utf8')).quotes ?? [];
    } catch (err) {
        console.warn('[downtime] Could not load downtimeQuotes.json, falling back to a single default quote:', err.message);
        quotesCache = [{ quote: 'Onward, adventurer.', author: '' }];
    }
    return quotesCache;
}

function randomQuote() {
    const quotes = loadQuotes();
    return quotes[Math.floor(Math.random() * quotes.length)];
}

function getTier(level) {
    return LEVEL_CONFIG[level]?.tier ?? null;
}

// ─── Level-up forum post ──────────────────────────────────────────────────────

async function postLevelUpMessage(client, forumThreadId, characterName, oldLevel, newLevel, charArtURL) {
    const thread = await client.channels.fetch(forumThreadId).catch(() => null);
    if (!thread) return;

    const q        = randomQuote();
    const oldTier  = getTier(oldLevel);
    const newTier  = getTier(newLevel);
    const tierChanged = newTier !== null && newTier !== oldTier;
    const color    = TIER_COLORS[Math.floor(Math.random() * TIER_COLORS.length)];

    const description = [
        `*"${q.quote}"*`,
        `— **${q.author}**`,
        ``,
        `Thanks for helping the Adventuring League and the people of the world. Keep it up!`,
        tierChanged ? `\n✨ You have raised above your station and now reached **Tier ${newTier}**!` : '',
        ``,
        `_Remember to update your character sheet to reflect this change._`,
    ].filter(line => line !== undefined).join('\n');

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎉 ${characterName} has levelled up to Level ${newLevel}!`)
        .setDescription(description)
        .setTimestamp();

    if (charArtURL) embed.setThumbnail(charArtURL);

    await thread.send({ embeds: [embed] });
}

async function applyMilestones(client, guild, character, characterName, amount) {
    const forumThreadId = character.properties['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
    const charArtURL    = character.properties['CharArtURL']?.url ?? null;

    const result = await withPageLock(character.id, async () => {
        const freshPage          = await getPageById(character.id);
        const p                  = freshPage.properties;
        const currentLevel       = p['Level']?.number ?? 1;
        const currentMilestones  = p['Milestones']?.number ?? 0;

        const newMilestoneTotal = currentMilestones + amount;
        const { newLevel, milestonesConsumed, milestonesRemaining, levelUps } = resolveLevelUps(currentLevel, newMilestoneTotal);

        await adjustCharacterNumbersUnlocked(character.id, { Milestones: amount - milestonesConsumed });

        if (levelUps > 0) {
            await setCharacterLevel(character.id, newLevel);
        }

        return { currentLevel, newLevel, currentMilestones, newMilestoneTotal, milestonesConsumed, milestonesRemaining, levelUps };
    });

    if (result.levelUps > 0 && forumThreadId) {
        await postLevelUpMessage(client, forumThreadId, characterName, result.currentLevel, result.newLevel, charArtURL);
    }

    return result;
}

// ─── Downtime blueprints ──────────────────────────────────────────────────────

function loadBlueprints() {
    return JSON.parse(fs.readFileSync(BLUEPRINTS_PATH, 'utf8')).blueprints;
}

function getBlueprint(activityId) {
    return loadBlueprints()[activityId] ?? null;
}

// ─── Key-based lookup (no UID needed) ──────────────────────────────────────────

function getBlueprintByKey(key) {
    if (!key) return null;
    const bp = loadBlueprints()[key];
    return bp ? { key, blueprint: bp } : null;
}

function blueprintNeedsTierChoice(key, blueprint) {
    return Boolean(blueprint.tiers) && key !== 'catch-up-level';
}

function tierLabel(blueprint, tier) {
    const valueLabel = tier.value ?? (tier.min != null || tier.max != null ? `${tier.min ?? '–'}–${tier.max ?? '–'}` : '?');
    const costLabel = formatTierCostShort(blueprint, tier);
    return `${valueLabel} — ${tier.daysRequired}d${costLabel ? ` · ${costLabel}` : ''}`;
}

function formatTierCostShort(blueprint, tier) {
    const paramName = getParamName(blueprint);
    const params = paramName && tier.value != null ? { [paramName]: tier.value } : {};
    const { gpTotal, gpPerDay } = sumCosts(tier.costs ?? [], params);
    const parts = [];
    if (gpTotal > 0) parts.push(`${gpTotal}gp`);
    if (gpPerDay > 0) parts.push(`${gpPerDay}gp/day`);
    return parts.join(' + ');
}

function listActivityChoices(query = '') {
    const blueprints = loadBlueprints();
    const q = query.toLowerCase();
    return Object.entries(blueprints)
        .filter(([key, bp]) => bp.name.toLowerCase().includes(q) || (bp.category ?? '').toLowerCase().includes(q))
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([key, bp]) => ({
            key,
            name: bp.name,
            category: bp.category,
            needsTier: blueprintNeedsTierChoice(key, bp),
        }));
}

function listTierChoices(key, query = '') {
    const resolved = getBlueprintByKey(key);
    if (!resolved || !resolved.blueprint.tiers) return [];
    const { blueprint } = resolved;
    const q = query.toLowerCase();
    return blueprint.tiers
        .filter(t => tierLabel(blueprint, t).toLowerCase().includes(q))
        .map(t => ({ id: t.id, label: tierLabel(blueprint, t), value: t.value }));
}

function getBlueprintById(UID) {
    if (UID == null) return null;
    const target = String(UID).toUpperCase();
    const bp = loadBlueprints();

    for (const key in bp) {
        const blueprint = bp[key];

        if (blueprint.tiers) {
            for (const tier of blueprint.tiers) {
                if (tier.id != null && String(tier.id).toUpperCase() === target) {
                    return { key, blueprint, tier };
                }
            }
        }

        if (blueprint.id != null && String(blueprint.id).toUpperCase() === target) {
            return { key, blueprint, tier: null };
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

function resolveCostFromUID(UID, quantity = 1) {
    const result = getBlueprintById(UID);
    if (!result) return null;

    const { blueprint, tier } = result;
    const paramName = getParamName(blueprint);
    const qty = Math.max(1, Number(quantity) || 1);

    if (tier) {
        const params = paramName && tier.value != null ? { [paramName]: tier.value } : {};
        const daysRequired = tier.daysRequired * qty;
        const costs = tier.costs ?? (tier.flatGp != null ? [{ type: 'gp', value: tier.flatGp }] : []);
        const { gpTotal, gpPerDay } = sumCosts(costs, params);
        const finalGpTotal = gpTotal * qty + (gpPerDay ? gpPerDay * daysRequired : 0);

        return {
            daysRequired,
            gpTotal: finalGpTotal,
            gpPerDay: gpPerDay || (daysRequired ? finalGpTotal / daysRequired : 0),
            tierValue: tier.value ?? null,
            quantity: qty,
        };
    }

    if (blueprint.costModel === 'flat' || blueprint.costModel === 'perDay') {
        const daysRequired = blueprint.daysRequired * qty;
        const costs = blueprint.costs ?? [
            ...(blueprint.flatGp != null ? [{ type: 'gp', value: blueprint.flatGp }] : []),
            ...(blueprint.gpPerDay != null ? [{ type: 'gpPerDay', value: blueprint.gpPerDay }] : []),
        ];
        const { gpTotal, gpPerDay } = sumCosts(costs, {});
        const finalGpTotal = gpTotal * qty + (gpPerDay ? gpPerDay * daysRequired : 0);

        return { daysRequired, gpTotal: finalGpTotal, gpPerDay: gpPerDay || (daysRequired ? finalGpTotal / daysRequired : 0), tierValue: null, quantity: qty };
    }

    return null;
}

const SCROLL_VALUE_BY_LEVEL = {
    0: 15, 1: 25, 2: 50, 3: 150, 4: 500, 5: 1000, 6: 1500, 7: 2500, 8: 5000, 9: 12000,
};

async function applyDowntimeOutput({ output, characterPageId, activityName, tierValue, quantity = 1, spellName = null, itemChoice = null, sourceQuestId = null }, notion, client = null, guild = null) {
    if (!output) return null;
    const qty = Math.max(1, Number(quantity) || 1);

    switch (output.type) {
        case 'milestone': {
            const amount = output.amount ?? 1;
            const char = await notion.getPageById(characterPageId);
            const characterName = char.properties['Character Name']?.title?.[0]?.plain_text ?? activityName;

            const { newLevel, levelUps } = await applyMilestones(client, guild, char, characterName, amount);

            const message = levelUps > 0
                ? `Gained ${amount} milestone${amount === 1 ? '' : 's'} — leveled up to ${newLevel}!`
                : `Gained ${amount} milestone${amount === 1 ? '' : 's'}.`;
            return { needsManualGrant: false, message };
        }
        case 'spellScroll': {
            if (!spellName) {
                return {
                    needsManualGrant: true,
                    message: `⚠️ **Manual grant needed:** Spell Scroll — from downtime activity "${activityName}", but no spell name was recorded. Use \`/leagueadmin item create\`.`,
                };
            }

            const level = typeof tierValue === 'number' ? tierValue : null;
            const rarity = typeof tierValue === 'string' ? tierValue : 'Common';
            const price = level != null ? (SCROLL_VALUE_BY_LEVEL[level] ?? null) : null;

            const created = [];
            for (let i = 0; i < qty; i++) {
                const item = await notion.createInventoryItem({
                    itemName: `Scroll of ${spellName}`,
                    characterPageId,
                    rarity,
                    type: 'Scroll',
                    subtype: 'Spell Scroll',
                    source: 'Downtime (Scribe a Spell Scroll)',
                    sourceQuestId,
                    itemValue: price,
                    status: 'Owned',
                    notes: `Scribed via downtime activity "${activityName}".`,
                });
                created.push(item);
            }

            const message = qty === 1
                ? `Scribed and granted a **Scroll of ${spellName}**.`
                : `Scribed and granted **${qty}× Scroll of ${spellName}** (each a separate item).`;
            return { needsManualGrant: false, message, itemsCreated: created.length };
        }
        case 'magicItem': {
            if (itemChoice) {
                const catalogueItem = getCatalogueItemByName(itemChoice);
                if (!catalogueItem) {
                    return {
                        needsManualGrant: true,
                        message: `⚠️ **Manual grant needed:** "${itemChoice}" (chosen for this crafting activity) could not be found in the item catalogue — it may have been renamed or removed. From downtime activity "${activityName}". Use \`/leagueadmin item create\`.`,
                    };
                }

                const created = [];
                for (let i = 0; i < qty; i++) {
                    const item = await notion.createInventoryItem({
                        itemName: catalogueItem.name,
                        characterPageId,
                        rarity: catalogueItem.rarity,
                        type: 'Magic Item',
                        subtype: inferSubtype(catalogueItem),
                        source: 'Downtime (Craft a Magic Item)',
                        sourceQuestId,
                        itemValue: catalogueItem.priceGp,
                        status: 'Owned',
                        notes: `Crafted via downtime activity "${activityName}".`,
                    });
                    created.push(item);
                }

                const message = qty === 1
                    ? `Crafted and granted a **${catalogueItem.name}**.`
                    : `Crafted and granted **${qty}× ${catalogueItem.name}** (each a separate item).`;
                return { needsManualGrant: false, message, itemsCreated: created.length };
            }

            const baseName = `${activityName}${tierValue ? ` (${tierValue})` : ''}`;
            const rarity = typeof tierValue === 'string' ? tierValue : 'Common';
            const type = 'Magic Item';

            if (qty === 1) {
                return {
                    needsManualGrant: true,
                    message: `⚠️ **Manual grant needed:** ${baseName} (${type}, ${rarity}) — from downtime activity "${activityName}". Use \`/leagueadmin item create\`.`,
                };
            }

            const lines = Array.from({ length: qty }, (_, i) => `  ${i + 1}. ${baseName} (${type}, ${rarity})`).join('\n');
            return {
                needsManualGrant: true,
                message: `⚠️ **Manual grant needed — ${qty} separate items** from downtime activity "${activityName}":\n${lines}\nUse \`/leagueadmin item create\` for each.`,
            };
        }
        case 'item': {
            const baseName = output.grants || activityName;
            const rarity = 'Common';
            const type = 'Item';

            if (qty === 1) {
                return {
                    needsManualGrant: true,
                    message: `⚠️ **Manual grant needed:** ${baseName} (${type}, ${rarity}) — from downtime activity "${activityName}". Use \`/leagueadmin item create\`.`,
                };
            }

            const lines = Array.from({ length: qty }, (_, i) => `  ${i + 1}. ${baseName} (${type}, ${rarity})`).join('\n');
            return {
                needsManualGrant: true,
                message: `⚠️ **Manual grant needed — ${qty} separate items** from downtime activity "${activityName}":\n${lines}\nUse \`/leagueadmin item create\` for each.`,
            };
        }
        case 'level': {
            const char = await notion.getPageById(characterPageId);
            const currentLevel = char.properties['Level']?.number ?? 1;
            await notion.setCharacterLevel(characterPageId, currentLevel + 1);
            return { needsManualGrant: false, message: `Level increased to ${currentLevel + 1}` };
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
            return { needsManualGrant: false, message: entry };
        }
        default:
            return null;
    }
}

module.exports = {
    applyMilestones, postLevelUpMessage, getTier, randomQuote, TIER_COLORS, loadQuotes,
    loadBlueprints, getBlueprint, getBlueprintById, nextDtaId, resolveCost, resolveCostFromUID, applyDowntimeOutput, getParamName, sumCosts,
    getBlueprintByKey, blueprintNeedsTierChoice, listActivityChoices, listTierChoices, tierLabel,
};
