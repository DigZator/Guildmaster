const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { adjustCharacterNumbersUnlocked, setCharacterLevel, withPageLock, getPageById } = require('./leagueNotion');
const { resolveLevelUps, LEVEL_CONFIG } = require('../config/leagueLeveling');

const BLUEPRINTS_PATH = path.join(__dirname, '..', 'data', 'downtimeBlueprints.json');
const SEQUENCE_PATH    = path.join(__dirname, '..', 'data', 'downtimeSequence.json');

const TIER_COLORS = [0xe74c3c, 0x3498db, 0x9b59b6, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x1abc9c];

const INSPIRING_QUOTES = [
    { quote: 'Not all those who wander are lost.', author: 'J.R.R. Tolkien' },
    { quote: 'Even the smallest person can change the course of the future.', author: 'J.R.R. Tolkien' },
    { quote: 'The cave you fear to enter holds the treasure you seek.', author: 'Joseph Campbell' },
    { quote: 'Courage is not the absence of fear, but the triumph over it.', author: 'Nelson Mandela' },
    { quote: 'Do not go where the path may lead; go instead where there is no path and leave a trail.', author: 'Ralph Waldo Emerson' },
    { quote: 'What we do in life echoes in eternity.', author: 'Marcus Aurelius' },
    { quote: 'Wheresoever you go, go with all your heart.', author: 'Confucius' },
    { quote: "chair", author: ''},
    { quote: "Believe in the ideal, not the idol.", author: 'Serra'},
    { quote: "Each year that passes rings you inwardly with memory and might. Wield your heart, and the world will tremble.", author: 'Doran'},
    { quote: "The thing I once imagined would be my greatest achievements were only the first steps toward a future I can only begin to fathom.", author: 'Jace Beleren'},
    { quote: "To care for yourself, cultivate the world. To care for the world, cultivate yourself.", author: ''},
    { quote: "What doesn't kill me, isn't trying hard enough.", author: 'Robote Gulliman' },
    { quote: "No matter how much you try to understand other people's hearts, people aren't able to change others. Every time, you have to change yourself.", author: 'Isagi Yoichi' },
    { quote: "What we think to be our greatest weakness can sometimes be our biggest strength.", author: 'Sarah J. Maas' },
];

function randomQuote() {
    return INSPIRING_QUOTES[Math.floor(Math.random() * INSPIRING_QUOTES.length)];
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

function resolveCostFromUID(UID) {
    const result = getBlueprintById(UID);
    if (!result) return null;

    const { blueprint, tier } = result;
    const paramName = getParamName(blueprint);

    if (tier) {
        const params = paramName && tier.value != null ? { [paramName]: tier.value } : {};
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

    if (blueprint.costModel === 'flat' || blueprint.costModel === 'perDay') {
        const daysRequired = blueprint.daysRequired;
        const costs = blueprint.costs ?? [
            ...(blueprint.flatGp != null ? [{ type: 'gp', value: blueprint.flatGp }] : []),
            ...(blueprint.gpPerDay != null ? [{ type: 'gpPerDay', value: blueprint.gpPerDay }] : []),
        ];
        const { gpTotal, gpPerDay } = sumCosts(costs, {});
        const finalGpTotal = gpTotal + (gpPerDay ? gpPerDay * daysRequired : 0);

        return { daysRequired, gpTotal: finalGpTotal, gpPerDay: gpPerDay || (daysRequired ? finalGpTotal / daysRequired : 0), tierValue: null };
    }

    return null;
}

async function applyDowntimeOutput({ output, characterPageId, activityName, tierValue }, notion, client = null, guild = null) {
    if (!output) return null;

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
        case 'item':
        case 'spellScroll':
        case 'magicItem': {
            const itemName = output.type === 'item'
                ? (output.grants || activityName)
                : `${activityName}${tierValue ? ` (${tierValue})` : ''}`;
            const rarity = output.type === 'item' ? 'Common' : (typeof tierValue === 'string' ? tierValue : 'Common');
            const type = output.type === 'spellScroll' ? 'Scroll' : (output.type === 'magicItem' ? 'Magic Item' : 'Item');
            return {
                needsManualGrant: true,
                message: `⚠️ **Manual grant needed:** ${itemName} (${type}, ${rarity}) — from downtime activity "${activityName}". Use \`/leagueadmin item create\`.`,
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
    applyMilestones, postLevelUpMessage, getTier, randomQuote, TIER_COLORS, INSPIRING_QUOTES,
    loadBlueprints, getBlueprint, getBlueprintById, nextDtaId, resolveCost, resolveCostFromUID, applyDowntimeOutput, getParamName, sumCosts,
};
