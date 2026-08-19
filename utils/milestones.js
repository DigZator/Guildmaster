const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { adjustCharacterNumbersUnlocked, setCharacterLevel, withPageLock, getPageById } = require('./leagueNotion');
const { resolveLevelUps, LEVEL_CONFIG } = require('../config/leagueLeveling');

const QUOTES_PATH = path.join(__dirname, '..', 'data', 'downtimeQuotes.json');
const TIER_COLORS = [0xe74c3c, 0x3498db, 0x9b59b6, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x1abc9c];

let quotesCache = null;

function loadQuotes() {
    if (quotesCache) return quotesCache;
    try {
        quotesCache = JSON.parse(fs.readFileSync(QUOTES_PATH, 'utf8')).quotes ?? [];
    } catch (err) {
        console.warn('[milestones] Could not load downtimeQuotes.json, falling back to a single default quote:', err.message);
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

module.exports = { applyMilestones, postLevelUpMessage, getTier, randomQuote, TIER_COLORS, loadQuotes };
