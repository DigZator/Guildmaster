const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { getActiveCharacter, adjustCharacterNumber, setCharacterLevel, createInventoryItem } = require('../utils/leagueNotion');
const { getCatalogueItemByCode, defaultPriceFor } = require('../utils/5etoolsCatalogue');
const { resolveLevelUps, LEVEL_CONFIG } = require('../config/leagueLeveling');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');
const { addAction, getAll, getById, removeById } = require('../utils/pendingActions');
const { leagueDMQuest, questLinkAutocomplete, approveQuestLink, approveQuestComplete, getQuestById, listQuests } = require('./leagueQuest');
const { leagueAdminShop, leagueAdminCatalogue } = require('./leagueShop');
const { leagueDowntime } = require('./leagueDowntime');
const { getRequest, removeRequest } = require('../utils/downtimeApprovals');
const { getDowntimeProgressById, setDowntimeStatus, createDowntimeProgress } = require('../utils/leagueNotion');
const leagueNotion = require('../utils/leagueNotion');
const { getBlueprint, nextDtaId, getBlueprintById, resolveCostFromUID, applyDowntimeOutput } = require('../utils/downtime');

const DM_ROLE_ID = process.env.DM_ROLE_ID;
const REP_MAX    = 2;
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
];

function randomQuote() {
    return INSPIRING_QUOTES[Math.floor(Math.random() * INSPIRING_QUOTES.length)];
}

function getTier(level) {
    return LEVEL_CONFIG[level]?.tier ?? null;
}

function extractPairs(interaction) {
	const pairs = [];
	for (let i = 1; i <= 6; i++) {
		const user   = interaction.options.getUser(`user${i}`);
		const amount = interaction.options.getInteger(`amount${i}`);
		if (user && amount !== null) pairs.push({ user, amount });
	}
	return pairs;
}

// ─── Quest validation (used by gold/rep/milestone/item grant commands) ───────

async function resolveActiveQuest(interaction) {
    const questId = interaction.options.getString('quest_id')?.toUpperCase();
    if (!questId) return { error: '❌ `quest_id` is required.' };

    const quest = await getQuestById(questId);
    if (!quest) return { error: `❌ No quest found with ID \`${questId}\`.` };

    const status = quest.properties['Status']?.select?.name;
    if (status !== 'Active') {
        return { error: `❌ Quest \`${questId}\` is not Active (current status: ${status}). Grants can only be made against an active quest.` };
    }

    const questName    = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const characterIds = quest.properties['Characters']?.relation?.map(r => r.id) ?? [];

    return { questId, questName, questPageId: quest.id, characterIds };
}

// ─── Admin log helper ─────────────────────────────────────────────────────────

async function sendAdminLog(guild, embed) {
    const channel = guild.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
    if (channel) await channel.send({ embeds: [embed] });
    else console.warn('[leagueGrants] LEAGUE_ADMIN_CHANNEL_ID not found in cache.');
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

// ─── Shared resolvers ─────────────────────────────────────────────────────────

async function resolveTarget(interaction) {
    const targetUser = interaction.options.getUser('user');
    const character  = await getActiveCharacter(targetUser.id);
    if (!character) {
        await interaction.editReply({
            content: `❌ **${targetUser.displayName}** does not have an active character.`,
        });
        return null;
    }
    return { targetUser, character };
}

// ─── Milestone resolver ───────────────────────────────────────────────────────

async function applyMilestones(client, guild, character, characterName, amount) {
    const p               = character.properties;
    const currentLevel     = p['Level']?.number ?? 1;
    const currentMilestones = p['Milestones']?.number ?? 0;
    const forumThreadId    = p['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
    const charArtURL = p['CharArtURL']?.url ?? null;

    const newMilestoneTotal = currentMilestones + amount;
    const { newLevel, milestonesConsumed, milestonesRemaining, levelUps } = resolveLevelUps(currentLevel, newMilestoneTotal);

    await adjustCharacterNumber(character.id, 'Milestones', amount - milestonesConsumed);

    if (levelUps > 0) {
        await setCharacterLevel(character.id, newLevel);
        if (forumThreadId) {
            await postLevelUpMessage(client, forumThreadId, characterName, currentLevel, newLevel, charArtURL);
        }
    }

    return { currentLevel, newLevel, currentMilestones, newMilestoneTotal, milestonesConsumed, milestonesRemaining, levelUps };
}

// ─── /leagueadmin rep ─────────────────────────────────────────────────────────

async function handleAdminRep(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    const amount = interaction.options.getInteger('amount');
    if (amount > REP_MAX) {
        return interaction.reply({
            content: `❌ You cannot grant more than **${REP_MAX} reputation** at once. Please contact a mod if more is needed.`,
            flags: 64,
        });
    }

    await interaction.deferReply({ flags: 64 });

    let resolved;
    try {
        resolved = await resolveTarget(interaction);
    } catch (err) {
        console.error('[leagueadmin rep] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }
    if (!resolved) return;

    const { targetUser, character } = resolved;
    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const currentRep    = character.properties['Reputation Points']?.number ?? 0;

    try {
        await adjustCharacterNumber(character.id, 'Reputation Points', amount);
    } catch (err) {
        console.error('[leagueadmin rep] Notion update error:', err);
        return interaction.editReply({ content: '❌ Failed to update reputation. Please try again.' });
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle('⭐ Reputation Granted')
        .addFields(
            { name: 'Character',  value: characterName,               inline: true },
            { name: 'Player',     value: `<@${targetUser.id}>`,       inline: true },
            { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Amount',     value: `+${amount}`,                inline: true },
            { name: 'New Total',  value: `${currentRep + amount}`,    inline: true },
        )
        .setTimestamp()
    );

    return interaction.editReply({ content: `✅ Granted **${amount} reputation** to **${characterName}**.` });
}

// ─── /leagueadmin gold ────────────────────────────────────────────────────────

async function handleAdminGold(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    const amount = interaction.options.getInteger('amount');
    await interaction.deferReply({ flags: 64 });

    let resolved;
    try {
        resolved = await resolveTarget(interaction);
    } catch (err) {
        console.error('[leagueadmin gold] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }
    if (!resolved) return;

    const { targetUser, character } = resolved;
    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const currentGold   = character.properties['Gold']?.number ?? 0;
    const newGold       = currentGold + amount;

    if (newGold < 0) {
        return interaction.editReply({ content: `❌ This would put **${characterName}** below 0 gp. Current balance: **${currentGold} gp**.` });
    }

    try {
        await adjustCharacterNumber(character.id, 'Gold', amount);
    } catch (err) {
        console.error('[leagueadmin gold] Notion update error:', err);
        return interaction.editReply({ content: '❌ Failed to update gold. Please try again.' });
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('💰 Gold Grant')
        .addFields(
            { name: 'Character',  value: characterName,               inline: true },
            { name: 'Player',     value: `<@${targetUser.id}>`,       inline: true },
            { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Amount',     value: `${amount > 0 ? '+' : ''}${amount} gp`, inline: true },
            { name: 'New Total',  value: `${newGold} gp`,             inline: true },
        )
        .setTimestamp()
    );

    return interaction.editReply({ content: `✅ Adjusted gold by **${amount > 0 ? '+' : ''}${amount} gp** for **${characterName}**. New balance: **${newGold} gp**.` });
}

// ─── /leagueadmin milestone ───────────────────────────────────────────────────

async function handleAdminMilestone(interaction, client) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    const amount = interaction.options.getInteger('amount');
    await interaction.deferReply({ flags: 64 });

    let resolved;
    try {
        resolved = await resolveTarget(interaction);
    } catch (err) {
        console.error('[leagueadmin milestone] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }
    if (!resolved) return;

    const { targetUser, character } = resolved;
    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    let result;
    try {
        result = await applyMilestones(client, interaction.guild, character, characterName, amount);
    } catch (err) {
        console.error('[leagueadmin milestone] Notion update error:', err);
        return interaction.editReply({ content: '❌ Failed to update milestones. Please try again.' });
    }

    const { currentLevel, newLevel, currentMilestones, milestonesConsumed, milestonesRemaining, levelUps } = result;

    const embedFields = [
        { name: 'Character',             value: characterName,               inline: true },
        { name: 'Player',                value: `<@${targetUser.id}>`,       inline: true },
        { name: 'Granted By',            value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Milestones Granted',    value: `+${amount}`,                inline: true },
        { name: 'Milestones Consumed',   value: `${milestonesConsumed}`,     inline: true },
        { name: 'Milestones Remaining',  value: `${milestonesRemaining}`,    inline: true },
    ];

    if (levelUps > 0) {
        embedFields.push({ name: 'Level', value: `${currentLevel} → ${newLevel}`, inline: true });
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🏆 Milestone Granted')
        .addFields(...embedFields)
        .setTimestamp()
    );

    const levelMsg = levelUps > 0 ? ` **${characterName}** levelled up to **Level ${newLevel}**!` : '';
    return interaction.editReply({ content: `✅ Granted **${amount} milestone(s)** to **${characterName}**.${levelMsg}` });
}

// ─── /leaguedm rep ────────────────────────────────────────────────────────────

async function handleDMRep(interaction) {
    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }

    const pairs = extractPairs(interaction);
    const results = [];
    const embedFields = [];
    let anyOffQuest = false;

    for (const { user, amount } of pairs) {
        if (amount > REP_MAX) {
            results.push(`❌ **${user.username}** — amount exceeds max (${REP_MAX}), skipped. Contact a mod.`);
            continue;
        }

        let character;
        try {
            character = await getActiveCharacter(user.id);
        } catch (err) {
            console.error('[leaguedm rep] Notion error:', err);
            results.push(`❌ **${user.username}** — database error, skipped.`);
            continue;
        }

        if (!character) {
            results.push(`❌ **${user.username}** — no active character found, skipped.`);
            continue;
        }

        const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const currentRep    = character.properties['Reputation Points']?.number ?? 0;
        const onQuest       = quest.characterIds.includes(character.id);
        if (!onQuest) anyOffQuest = true;

        const entry = addAction({
            type: 'reputation',
            dm: { discordId: interaction.user.id, username: interaction.user.username },
            target: {
                discordId: user.id,
                username:  user.username,
                characterName,
                characterPageId: character.id,
            },
            quest: { questId: quest.questId, questName: quest.questName, questPageId: quest.questPageId },
            payload: { amount, currentRep },
        });

        embedFields.push(
            { name: characterName, value: `+${amount} (was ${currentRep})${onQuest ? '' : ' ⚠️ not on roster'}`, inline: true },
            { name: 'Player',      value: `<@${user.id}>`,          inline: true },
            { name: 'Action ID',   value: `\`${entry.id}\``,        inline: true },
        );

        results.push(onQuest
            ? `✅ **${characterName}** — pending approval. ID: \`${entry.id}\``
            : `⚠️ **${characterName}** — pending approval (not on quest roster). ID: \`${entry.id}\``
        );
    }

    if (embedFields.length > 0) {
        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(anyOffQuest ? 0xf1c40f : 0x5865f2)
            .setTitle('⏳ Reputation Grants — Pending Approval')
            .setDescription(`Quest: ${quest.questName} (\`${quest.questId}\`)\nRequested by <@${interaction.user.id}>`)
            .addFields(...embedFields)
            .setTimestamp()
        );
    }

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leaguedm gold ───────────────────────────────────────────────────────────

async function handleDMGold(interaction) {
    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }

    const pairs = extractPairs(interaction);
    const results = [];
    const embedFields = [];

    for (const { user, amount } of pairs) {
        if (amount < 0) {
            results.push(`❌ **${user.username}** — DMs cannot grant negative gold, skipped.`);
            continue;
        }

        let character;
        try {
            character = await getActiveCharacter(user.id);
        } catch (err) {
            console.error('[leaguedm gold] Notion error:', err);
            results.push(`❌ **${user.username}** — database error, skipped.`);
            continue;
        }

        if (!character) {
            results.push(`❌ **${user.username}** — no active character found, skipped.`);
            continue;
        }

        const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const currentGold   = character.properties['Gold']?.number ?? 0;
        const onQuest       = quest.characterIds.includes(character.id);

        const entry = addAction({
            type: 'gold',
            dm: { discordId: interaction.user.id, username: interaction.user.username },
            target: {
                discordId: user.id,
                username:  user.username,
                characterName,
                characterPageId: character.id,
            },
            quest: { questId: quest.questId, questName: quest.questName, questPageId: quest.questPageId },
            payload: { amount, currentGold },
        });

        embedFields.push(
        	{ name: `${characterName}`, value: `+${amount} gp (was ${currentGold} gp)`, inline: true },
  	        { name: 'Player', 			value: `<@${user.id}>`,             			inline: true },
  	        { name: 'Action ID',		value: `\`${entry.id}\``,						inline: true },
  	        ...(onQuest ? [] : [{ name: '⚠️', value: `Not on quest roster`, inline: true}]),
        );

        results.push(onQuest
            ? `✅ **${characterName}** — pending approval. ID: \`${entry.id}\``
            : `⚠️ **${characterName}** — pending approval (not on quest roster). ID: \`${entry.id}\``
        );
    }

    if (embedFields.length > 0) {
	    await sendAdminLog(interaction.guild, new EmbedBuilder()
	        .setColor(0xf1c40f)
	        .setTitle('⏳ Gold Grants — Pending Approval')
	        .setDescription(`Quest: ${quest.questName} (\`${quest.questId}\`)\nRequested by <@${interaction.user.id}>`)
	        .addFields(...embedFields)
	        .setTimestamp()
	    );
	}

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leaguedm milestone ──────────────────────────────────────────────────────

async function handleDMMilestone(interaction) {
    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }

    const pairs = extractPairs(interaction);
    const results = [];
    const embedFields = [];
    let anyOffQuest = false;

    for (const { user, amount } of pairs) {
        let character;
        try {
            character = await getActiveCharacter(user.id);
        } catch (err) {
            console.error('[leaguedm milestone] Notion error:', err);
            results.push(`❌ **${user.username}** — database error, skipped.`);
            continue;
        }

        if (!character) {
            results.push(`❌ **${user.username}** — no active character found, skipped.`);
            continue;
        }

        const characterName     = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const currentMilestones = character.properties['Milestones']?.number ?? 0;
        const currentLevel      = character.properties['Level']?.number ?? 1;
        const onQuest           = quest.characterIds.includes(character.id);
        if (!onQuest) anyOffQuest = true;

        const entry = addAction({
            type: 'milestone',
            dm: { discordId: interaction.user.id, username: interaction.user.username },
            target: {
                discordId: user.id,
                username:  user.username,
                characterName,
                characterPageId: character.id,
            },
            quest: { questId: quest.questId, questName: quest.questName, questPageId: quest.questPageId },
            payload: { amount, currentMilestones, currentLevel },
        });

        embedFields.push(
            { name: characterName, value: `+${amount} (Lvl ${currentLevel}, was ${currentMilestones} ms)${onQuest ? '' : ' ⚠️ not on roster'}`, inline: true },
            { name: 'Player',      value: `<@${user.id}>`,   inline: true },
            { name: 'Action ID',   value: `\`${entry.id}\``, inline: true },
        );

        results.push(onQuest
            ? `✅ **${characterName}** — pending approval. ID: \`${entry.id}\``
            : `⚠️ **${characterName}** — pending approval (not on quest roster). ID: \`${entry.id}\``
        );
    }

    if (embedFields.length > 0) {
        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(anyOffQuest ? 0xf1c40f : 0x5865f2)
            .setTitle('⏳ Milestone Grants — Pending Approval')
            .setDescription(`Quest: ${quest.questName} (\`${quest.questId}\`)\nRequested by <@${interaction.user.id}>`)
            .addFields(...embedFields)
            .setTimestamp()
        );
    }

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leagueadmin pending ─────────────────────────────────────────────────────

async function handlePending(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const actions = getAll().filter(a => a.status === 'pending');

    if (actions.length === 0) {
        return interaction.editReply({ content: '✅ No pending actions.' });
    }

    const lines = actions.map(a => {
        const label = a.target?.characterName
            ? `${a.target.characterName} (+${a.payload?.amount})`
            : a.quest?.questName ?? 'Unknown';
        return `\`${a.id}\` — **${a.type}** | ${label} | Requested by <@${a.dm.discordId}> | <t:${Math.floor(new Date(a.createdAt).getTime() / 1000)}:R>`;
    });

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('⏳ Pending Actions')
        .setDescription(lines.join('\n'))
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

// ─── /leagueadmin approve ─────────────────────────────────────────────────────

async function handleApprove(interaction, client) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    const ids = interaction.options.getString('id').split(',').map(s => s.trim()).filter(Boolean);
    await interaction.deferReply({ flags: 64 });

    const results = [];

    for (const id of ids) {
        const entry = getById(id);
        if (!entry) {
            results.push(`❌ \`${id}\` — not found.`);
            continue;
        }

        try {
            if (entry.type === 'reputation') {
	            await adjustCharacterNumber(entry.target.characterPageId, 'Reputation Points', entry.payload.amount);
	            await sendAdminLog(interaction.guild, new EmbedBuilder()
	                .setColor(0x57f287)
	                .setTitle('✅ Reputation Grant Approved')
	                .addFields(
	                    { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
	                    { name: 'Character',    value: entry.target.characterName,     inline: true },
	                    { name: 'Player',       value: `<@${entry.target.discordId}>`, inline: true },
	                    { name: 'Approved By',  value: `<@${interaction.user.id}>`,    inline: true },
	                    { name: 'Requested By', value: `<@${entry.dm.discordId}>`,     inline: true },
	                    { name: 'Amount',       value: `+${entry.payload.amount}`,     inline: true },
	                    { name: 'Action ID',    value: `\`${entry.id}\``,             inline: false },
	                )
	                .setTimestamp()
	            );
	        }

            if (entry.type === 'gold') {
	            await adjustCharacterNumber(entry.target.characterPageId, 'Gold', entry.payload.amount);
	            if (entry.quest?.questPageId) {
	                await adjustCharacterNumber(entry.quest.questPageId, 'Gold Awarded', entry.payload.amount);
	            }
	            await sendAdminLog(interaction.guild, new EmbedBuilder()
	                .setColor(0x57f287)
	                .setTitle('✅ Gold Grant Approved')
	                .addFields(
	                    { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
	                    { name: 'Character',    value: entry.target.characterName,     inline: true },
	                    { name: 'Player',       value: `<@${entry.target.discordId}>`, inline: true },
	                    { name: 'Approved By',  value: `<@${interaction.user.id}>`,    inline: true },
	                    { name: 'Requested By', value: `<@${entry.dm.discordId}>`,     inline: true },
	                    { name: 'Amount',       value: `+${entry.payload.amount} gp`,  inline: true },
	                    { name: 'Action ID',    value: `\`${entry.id}\``,             inline: false },
	                )
	                .setTimestamp()
	            );
	        }

            if (entry.type === 'milestone') {
                const character = await getActiveCharacter(entry.target.discordId);
                if (!character) {
                    results.push(`❌ \`${id}\` — **${entry.target.characterName}** no longer has an active character, skipped.`);
                    continue;
                }

                const result = await applyMilestones(client, interaction.guild, character, entry.target.characterName, entry.payload.amount);
                const { currentLevel, newLevel, milestonesConsumed, milestonesRemaining, levelUps } = result;

                const embedFields = [
                    { name: 'Quest',                value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
                    { name: 'Character',            value: entry.target.characterName,     inline: true },
                    { name: 'Player',               value: `<@${entry.target.discordId}>`, inline: true },
                    { name: 'Approved By',          value: `<@${interaction.user.id}>`,    inline: true },
                    { name: 'Requested By',         value: `<@${entry.dm.discordId}>`,     inline: true },
                    { name: 'Milestones Granted',   value: `+${entry.payload.amount}`,     inline: true },
                    { name: 'Milestones Consumed',  value: `${milestonesConsumed}`,        inline: true },
                    { name: 'Milestones Remaining', value: `${milestonesRemaining}`,       inline: true },
                ];
                if (levelUps > 0) {
                    embedFields.push({ name: 'Level', value: `${currentLevel} → ${newLevel}`, inline: true });
                }

                await sendAdminLog(interaction.guild, new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle('✅ Milestone Grant Approved')
                    .addFields(...embedFields)
                    .setTimestamp()
                );
            }

            if (entry.type === 'item') {
	            const { itemName, type, subtype, rarity, itemValue, source, notes } = entry.payload;
	            const page = await createInventoryItem({
	                itemName, type, subtype, rarity, itemValue, source, notes,
	                characterPageId: entry.target.characterPageId,
	                sourceQuestId: entry.quest?.questPageId ?? null,
	                status: 'Owned',
	            });
	            await sendAdminLog(interaction.guild, new EmbedBuilder()
	                .setColor(0x57f287)
	                .setTitle('✅ Item Grant Approved')
	                .addFields(
	                    { name: 'Quest',        value: entry.quest ? `${entry.quest.questName} (\`${entry.quest.questId}\`)` : 'N/A', inline: false },
	                    { name: 'Item',         value: itemName,                           inline: true },
	                    { name: 'Rarity',       value: rarity,                             inline: true },
	                    { name: 'Character',    value: entry.target.characterName,         inline: true },
	                    { name: 'Player',       value: `<@${entry.target.discordId}>`,     inline: true },
	                    { name: 'Approved By',  value: `<@${interaction.user.id}>`,        inline: true },
	                    { name: 'Requested By', value: `<@${entry.dm.discordId}>`,         inline: true },
	                    { name: 'Notion ID',    value: `\`${page.id}\``,                  inline: false },
	                )
	                .setTimestamp()
	            );
	        }

            
            if (entry.type === 'quest-link') {
                const { questId } = await approveQuestLink(entry, interaction);
                results.push(`✅ \`${id}\` — **${entry.payload.adventureName}** linked. Quest ID: \`${questId}\``);
                removeById(id);
                continue;
            }
            
            if (entry.type === 'quest-complete') {
                await approveQuestComplete(entry, interaction);
                results.push(`✅ \`${id}\` — **${entry.quest.questName}** marked completed.`);
				removeById(id);
                continue;
            }

            removeById(id);
            results.push(`✅ \`${id}\` — **${entry.target.characterName}** (${entry.type}) approved.`);

        } catch (err) {
            console.error(`[leagueadmin approve] Error applying action ${id}:`, err);
            results.push(`❌ \`${id}\` — error applying, skipped. Check logs.`);
        }
    }

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leagueadmin reject ──────────────────────────────────────────────────────────────────

async function handleReject(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    const ids = interaction.options.getString('id').split(',').map(s => s.trim()).filter(Boolean);
    await interaction.deferReply({ flags: 64 });

    const results = [];

    for (const id of ids) {
        const entry = getById(id);
        if (!entry) {
            results.push(`❌ \`${id}\` — not found.`);
            continue;
        }

        removeById(id);

        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Grant Rejected')
            .addFields(
                { name: 'Type',         value: entry.type,                         inline: true },
                { name: 'Character',    value: entry.target.characterName,         inline: true },
                { name: 'Player',       value: `<@${entry.target.discordId}>`,     inline: true },
                { name: 'Rejected By',  value: `<@${interaction.user.id}>`,        inline: true },
                { name: 'Requested By', value: `<@${entry.dm.discordId}>`,         inline: true },
                { name: 'Amount',       value: `+${entry.payload.amount}`,         inline: true },
                { name: 'Action ID',    value: `\`${entry.id}\``,                 inline: false },
            )
            .setTimestamp()
        );

        results.push(`✅ \`${id}\` — **${entry.target.characterName}** (${entry.type}) rejected.`);
    }

    return interaction.editReply({ content: results.join('\n') });
}

async function handleAdminDowntimeApprove(interaction) {
    await interaction.deferReply({ flags: 64 });
    const id = interaction.options.getString('id').toUpperCase();

    const startReq = getRequest(id);
    if (startReq) {
        const resolved = getBlueprintById(startReq.uid);
        if (!resolved) {
            return interaction.editReply({ content: `❌ Request \`${id}\` refers to a UID (\`${startReq.uid}\`) that no longer exists. It was not approved — you may want to reject it instead.` });
        }
        const { key, blueprint } = resolved;

        const cost = resolveCostFromUID(startReq.uid);
        if (!cost) {
            return interaction.editReply({ content: `❌ Could not resolve a valid cost for **${blueprint.name}** (UID \`${startReq.uid}\`). It was not approved.` });
        }

        const dtaId = nextDtaId();
        try {
            await createDowntimeProgress({
                dtaId, activityId: key, activityName: blueprint.name, characterPageId: startReq.characterPageId,
                activityType: blueprint.category, daysRequired: cost.daysRequired,
                daysInvested: 0, goldRequired: cost.gpTotal, goldInvested: 0, paramValue: cost.tierValue,
            });
        } catch (err) {
            console.error('[downtime approve] Notion error:', err);
            return interaction.editReply({ content: `❌ Failed to create the downtime activity for request \`${id}\`. Please try again.` });
        }

        removeRequest(id);

        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('✅ Downtime Start Approved')
            .addFields(
                { name: 'Request ID', value: `\`${id}\``, inline: true },
                { name: 'DTA ID',     value: `\`${dtaId}\``, inline: true },
                { name: 'Activity',   value: blueprint.name, inline: true },
                { name: 'Player',     value: `<@${startReq.discordUserId}>`, inline: true },
                { name: 'Approved By',value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp()
        );

        return interaction.editReply({ content: `✅ Approved start request \`${id}\` — **${blueprint.name}** created as \`${dtaId}\`.` });
    }

    const progress = await getDowntimeProgressById(id).catch(() => null);
    if (!progress) return interaction.editReply({ content: `❌ No pending request or downtime activity found for \`${id}\`.` });

    const status = progress.properties['Status']?.select?.name;
    if (status !== 'Pending Completion Approval') {
        return interaction.editReply({ content: `❌ \`${id}\` is not awaiting completion approval (current status: ${status}).` });
    }

    await setDowntimeStatus(progress.id, 'Completed');

    const p = progress.properties;
    const activityId = p['Activity ID']?.rich_text?.[0]?.plain_text ?? null;
    const activityName = p['Activity Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const characterRelId = p['Character']?.relation?.[0]?.id ?? null;
    const storedParam = p['Param Value']?.rich_text?.[0]?.plain_text ?? null;

    let outputResult = null;
    const blueprint = activityId ? getBlueprint(activityId) : null;
    if (blueprint?.output && characterRelId) {
        const tierValue = storedParam != null && !isNaN(Number(storedParam)) ? Number(storedParam) : storedParam;
        try {
            outputResult = await applyDowntimeOutput({ output: blueprint.output, characterPageId: characterRelId, activityName, tierValue }, leagueNotion);
        } catch (err) {
            console.error('[downtime approve] Failed to apply output:', err);
        }
    }
    
    if (outputResult) {
        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(outputResult.needsManualGrant ? 0xe67e22 : 0x2ecc71)
            .setTitle(outputResult.needsManualGrant ? '🎒 Downtime Output — Manual Grant Needed' : '🎁 Downtime Output Applied')
            .addFields(
                { name: 'Request ID', value: `\`${id}\``, inline: true },
                { name: 'Activity',   value: activityName, inline: true },
                { name: 'Output',     value: outputResult.message, inline: false },
            )
            .setTimestamp()
        );
    }
    
    return interaction.editReply({
        content: `✅ Completion approved for \`${id}\`.${outputResult ? ` ${outputResult.message}` : ''}`,
    });
}

// ─── /leagueadmin item create ──────────────────────────────────────────────────────────────────

async function handleAdminItemCreate(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const itemName  = interaction.options.getString('name');
    const type      = interaction.options.getString('type');
    const rarity    = interaction.options.getString('rarity');
    const subtype   = interaction.options.getString('subtype');
    const itemValue = interaction.options.getInteger('value');
    const source    = interaction.options.getString('source');
    const notes     = interaction.options.getString('notes');
    const targetUser = interaction.options.getUser('player');

    let characterPageId = null;
    let characterName   = null;

    if (targetUser) {
        let character;
        try {
            character = await getActiveCharacter(targetUser.id);
        } catch (err) {
            console.error('[leagueadmin item create] Notion error:', err);
            return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
        }
        if (!character) {
            return interaction.editReply({ content: `❌ **${targetUser.displayName}** does not have an active character.` });
        }
        characterPageId = character.id;
        characterName   = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    }

    let page;
    try {
        page = await createInventoryItem({
            itemName, type, rarity, subtype, itemValue, source, notes,
            characterPageId,
            status: characterPageId ? 'Owned' : 'Stored',
        });
    } catch (err) {
        console.error('[leagueadmin item create] Notion create error:', err);
        return interaction.editReply({ content: '❌ Failed to create item. Please try again.' });
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🎒 Item Created')
        .addFields(
            { name: 'Item',       value: itemName,                       inline: true },
            { name: 'Type',       value: `${type}${subtype ? ` — ${subtype}` : ''}`, inline: true },
            { name: 'Rarity',     value: rarity,                         inline: true },
            { name: 'Created By', value: `<@${interaction.user.id}>`,    inline: true },
            { name: 'Assigned To', value: characterName ? `${characterName} (<@${targetUser.id}>)` : 'Unassigned', inline: true },
            { name: 'Notion ID',  value: `\`${page.id}\``,              inline: false },
        )
        .setTimestamp()
    );

    const assignedMsg = characterName ? ` Assigned to **${characterName}**.` : ' Item is unassigned.';
    return interaction.editReply({ content: `✅ Created **${itemName}**.${assignedMsg}` });
}

// ─── Catalogue → inventory item mapping ────────────────────────────────────────

const SUBTYPE_BY_CATALOGUE_TYPE = { Potion: 'Potion', Scroll: 'Spell Scroll', Ammunition: 'Ammo' };

function inferSubtype(catalogueItem) {
    return SUBTYPE_BY_CATALOGUE_TYPE[catalogueItem.type] ?? 'Other';
}

function resolveCatalogueImport(code, overrides = {}) {
    const catalogueItem = getCatalogueItemByCode(code);
    if (!catalogueItem) return { error: `❌ No catalogue item found for \`${code}\`. Try \`/league shop search\` to find the right code.` };

    return {
        itemName: catalogueItem.name,
        type:     catalogueItem.type,
        rarity:   catalogueItem.rarity,
        subtype:  inferSubtype(catalogueItem),
        itemValue: overrides.itemValue ?? catalogueItem.priceGp ?? defaultPriceFor(catalogueItem.rarity),
        notes:    overrides.notes ?? (catalogueItem.description ? catalogueItem.description.slice(0, 500) : undefined),
        catalogueCode: catalogueItem.code,
    };
}

// ─── /leagueadmin item import ───────────────────────────────────────────────────────────────

async function handleAdminItemImport(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const code       = interaction.options.getString('code');
    const targetUser = interaction.options.getUser('player');
    const valueOverride   = interaction.options.getInteger('value');
    const source          = interaction.options.getString('source');
    const notesOverride   = interaction.options.getString('notes');

    const resolved = resolveCatalogueImport(code, {
        itemValue: valueOverride, notes: notesOverride,
    });
    if (resolved.error) return interaction.editReply({ content: resolved.error });

    const { itemName, type, rarity, subtype, itemValue, notes, catalogueCode } = resolved;

    let characterPageId = null;
    let characterName   = null;

    if (targetUser) {
        let character;
        try {
            character = await getActiveCharacter(targetUser.id);
        } catch (err) {
            console.error('[leagueadmin item import] Notion error:', err);
            return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
        }
        if (!character) {
            return interaction.editReply({ content: `❌ **${targetUser.displayName}** does not have an active character.` });
        }
        characterPageId = character.id;
        characterName   = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    }

    let page;
    try {
        page = await createInventoryItem({
            itemName, type, rarity, subtype, itemValue, source, notes,
            characterPageId,
            status: characterPageId ? 'Owned' : 'Stored',
        });
    } catch (err) {
        console.error('[leagueadmin item import] Notion create error:', err);
        return interaction.editReply({ content: '❌ Failed to import item. Please try again.' });
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🎒 Item Imported From Catalogue')
        .addFields(
            { name: 'Item',        value: itemName,                       inline: true },
            { name: 'Type',        value: `${type}${subtype ? ` — ${subtype}` : ''}`, inline: true },
            { name: 'Rarity',      value: rarity,                         inline: true },
            { name: 'Catalogue Code', value: `\`${catalogueCode}\``,      inline: true },
            { name: 'Imported By', value: `<@${interaction.user.id}>`,    inline: true },
            { name: 'Assigned To', value: characterName ? `${characterName} (<@${targetUser.id}>)` : 'Unassigned', inline: true },
            { name: 'Notion ID',   value: `\`${page.id}\``,               inline: false },
        )
        .setTimestamp()
    );

    const assignedMsg = characterName ? ` Assigned to **${characterName}**.` : ' Item is unassigned.';
    return interaction.editReply({ content: `✅ Imported **${itemName}** from the catalogue (\`${catalogueCode}\`).${assignedMsg}` });
}

// ─── /leaguedm item create ──────────────────────────────────────────────────────────────────

async function handleDMItemCreate(interaction) {
    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }

    const itemName   = interaction.options.getString('name');
    const type       = interaction.options.getString('type');
    const rarity     = interaction.options.getString('rarity');
    const subtype    = interaction.options.getString('subtype');
    const itemValue  = interaction.options.getInteger('value');
    const source     = interaction.options.getString('source');
    const notes      = interaction.options.getString('notes');
    const targetUser = interaction.options.getUser('player');

    let character;
    try {
        character = await getActiveCharacter(targetUser.id);
    } catch (err) {
        console.error('[leaguedm item create] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }
    if (!character) {
        return interaction.editReply({ content: `❌ **${targetUser.displayName}** does not have an active character.` });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const onQuest        = quest.characterIds.includes(character.id);

    const entry = addAction({
        type: 'item',
        dm: { discordId: interaction.user.id, username: interaction.user.username },
        target: {
            discordId: targetUser.id,
            username:  targetUser.username,
            characterName,
            characterPageId: character.id,
        },
        quest: { questId: quest.questId, questName: quest.questName, questPageId: quest.questPageId },
        payload: { itemName, type, subtype, rarity, itemValue, source, notes },
    });

    const embedFields = [
        { name: 'Quest',        value: `${quest.questName} (\`${quest.questId}\`)`, inline: false },
        { name: 'Item',         value: itemName,                       inline: true },
        { name: 'Type',         value: `${type}${subtype ? ` — ${subtype}` : ''}`, inline: true },
        { name: 'Rarity',       value: rarity,                         inline: true },
        { name: 'Character',    value: characterName,                   inline: true },
        { name: 'Player',       value: `<@${targetUser.id}>`,           inline: true },
        { name: 'Requested By', value: `<@${interaction.user.id}>`,     inline: true },
    ];
    if (!onQuest) {
        embedFields.push({ name: '⚠️ Warning', value: `**${characterName}** is not on the quest roster for \`${quest.questId}\`.`, inline: false });
    }
    embedFields.push({ name: 'Action ID', value: `\`${entry.id}\``, inline: false });

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(onQuest ? 0x5865f2 : 0xf1c40f)
        .setTitle('⏳ Item Grant — Pending Approval')
        .addFields(...embedFields)
        .setTimestamp()
    );

    return interaction.editReply({ content: onQuest
        ? `✅ **${itemName}** for **${characterName}** — pending approval. ID: \`${entry.id}\``
        : `⚠️ **${itemName}** for **${characterName}** — pending approval (not on quest roster). ID: \`${entry.id}\``
    });
}

// ─── /leaguedm item import ──────────────────────────────────────────────────────────────────

async function handleDMItemImport(interaction) {
    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }

    const code       = interaction.options.getString('code');
    const targetUser = interaction.options.getUser('player');
    const source          = interaction.options.getString('source');
    const notesOverride   = interaction.options.getString('notes');

    const resolved = resolveCatalogueImport(code, {
        notes: notesOverride,
    });
    if (resolved.error) return interaction.editReply({ content: resolved.error });

    const { itemName, type, rarity, subtype, itemValue, notes, catalogueCode } = resolved;

    let character;
    try {
        character = await getActiveCharacter(targetUser.id);
    } catch (err) {
        console.error('[leaguedm item import] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }
    if (!character) {
        return interaction.editReply({ content: `❌ **${targetUser.displayName}** does not have an active character.` });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const onQuest        = quest.characterIds.includes(character.id);

    const entry = addAction({
        type: 'item',
        dm: { discordId: interaction.user.id, username: interaction.user.username },
        target: {
            discordId: targetUser.id,
            username:  targetUser.username,
            characterName,
            characterPageId: character.id,
        },
        quest: { questId: quest.questId, questName: quest.questName, questPageId: quest.questPageId },
        payload: { itemName, type, subtype, rarity, itemValue, source, notes },
    });

    const embedFields = [
        { name: 'Quest',        value: `${quest.questName} (\`${quest.questId}\`)`, inline: false },
        { name: 'Item',         value: itemName,                       inline: true },
        { name: 'Type',         value: `${type}${subtype ? ` — ${subtype}` : ''}`, inline: true },
        { name: 'Rarity',       value: rarity,                         inline: true },
        { name: 'Catalogue Code', value: `\`${catalogueCode}\``,       inline: true },
        { name: 'Character',    value: characterName,                   inline: true },
        { name: 'Player',       value: `<@${targetUser.id}>`,           inline: true },
        { name: 'Requested By', value: `<@${interaction.user.id}>`,     inline: true },
    ];
    if (!onQuest) {
        embedFields.push({ name: '⚠️ Warning', value: `**${characterName}** is not on the quest roster for \`${quest.questId}\`.`, inline: false });
    }
    embedFields.push({ name: 'Action ID', value: `\`${entry.id}\``, inline: false });

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(onQuest ? 0x5865f2 : 0xf1c40f)
        .setTitle('⏳ Item Grant (Catalogue Import) — Pending Approval')
        .addFields(...embedFields)
        .setTimestamp()
    );

    return interaction.editReply({ content: onQuest
        ? `✅ **${itemName}** (imported from \`${catalogueCode}\`) for **${characterName}** — pending approval. ID: \`${entry.id}\``
        : `⚠️ **${itemName}** (imported from \`${catalogueCode}\`) for **${characterName}** — pending approval (not on quest roster). ID: \`${entry.id}\``
    });
}

// ─── Routers ──────────────────────────────────────────────────────────────────

async function leagueAdmin(interaction, client) {
	const group = interaction.options.getSubcommandGroup();
	const sub = interaction.options.getSubcommand();
	if (group === 'item') {
		if (sub === 'create') return handleAdminItemCreate(interaction);
		if (sub === 'import') return handleAdminItemImport(interaction);
	}
	if (group === 'shop')      return leagueAdminShop(interaction);
	if (group === 'catalogue') return leagueAdminCatalogue(interaction);
	if (group === 'downtime') {
		if (sub === 'approve') return handleAdminDowntimeApprove(interaction);
	}
	if (sub === 'rep')       return handleAdminRep(interaction);
	if (sub === 'gold')      return handleAdminGold(interaction);
	if (sub === 'milestone') return handleAdminMilestone(interaction, client);
	if (sub === 'pending') return handlePending(interaction);
	if (sub === 'approve') return handleApprove(interaction, client);
	if (sub === 'reject') return handleReject(interaction);
}

async function leagueDM(interaction, client) {
	const sub = interaction.options.getSubcommand();
	const group = interaction.options.getSubcommandGroup();
	if (group === "item") {
		if (sub === 'create') return handleDMItemCreate(interaction);
		if (sub === 'import') return handleDMItemImport(interaction);
	}
	if (group === "quest") 	 return leagueDMQuest(interaction);
	if (sub === 'rep')       return handleDMRep(interaction);
	if (sub === 'gold')      return handleDMGold(interaction);
	if (sub === 'milestone') return handleDMMilestone(interaction);
}

module.exports = { leagueAdmin, leagueDM, leagueDowntime };
