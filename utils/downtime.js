const { EmbedBuilder } = require('discord.js');
const { adjustCharacterNumbersUnlocked, setCharacterLevel, withPageLock, getPageById } = require('./leagueNotion');
const { resolveLevelUps, LEVEL_CONFIG } = require('../config/leagueLeveling');

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

module.exports = { applyMilestones, postLevelUpMessage, getTier, randomQuote, TIER_COLORS, INSPIRING_QUOTES };
