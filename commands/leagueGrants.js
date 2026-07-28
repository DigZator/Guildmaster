const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { getActiveCharacter, adjustCharacterNumber, setCharacterLevel, createInventoryItem } = require('../utils/leagueNotion');
const { getCatalogueItemByCode, defaultPriceFor } = require('../utils/5etoolsCatalogue');
const { applyMilestones } = require('../utils/milestones');
const { addAction, getAll, getById, removeById } = require('../utils/pendingActions');
const { leagueDMQuest, questLinkAutocomplete, approveQuestLink, approveQuestComplete, getQuestById, listQuests } = require('./leagueQuest');
const { leagueAdminShop, leagueAdminCatalogue } = require('./leagueShop');
const { leagueDowntime } = require('./leagueDowntime');
const { getRequest, removeRequest } = require('../utils/downtimeApprovals');
const { getDowntimeProgressById, setDowntimeStatus, createDowntimeProgress } = require('../utils/leagueNotion');
const leagueNotion = require('../utils/leagueNotion');
const { findCharacterStatusIssues } = require('../utils/leagueNotion');
const { getBlueprint, nextDtaId, getBlueprintById, resolveCostFromUID, applyDowntimeOutput } = require('../utils/downtime');
const { formatCurrency } = require('../utils/currency');
const { sendAdminLog } = require('../utils/adminLog');

const DM_ROLE_ID = process.env.DM_ROLE_ID;
const REP_MAX    = 2;

function extractPairs(interaction, amountGetter = 'getInteger') {
	const pairs = [];
	for (let i = 1; i <= 6; i++) {
		const user   = interaction.options.getUser(`user${i}`);
		const amount = interaction.options[amountGetter](`amount${i}`);
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

// ─── Shared admin single-target grant executor ─────────────────────────────────

async function runAdminGrant(interaction, config) {
    const { label, getAmount, validateAmount, mutate, buildEmbed, buildReply } = config;

    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    const amount = getAmount(interaction);
    if (validateAmount) {
        const validationError = validateAmount(amount);
        if (validationError) {
            return interaction.reply({ content: validationError, flags: 64 });
        }
    }

    await interaction.deferReply({ flags: 64 });

    let resolved;
    try {
        resolved = await resolveTarget(interaction);
    } catch (err) {
        console.error(`[leagueadmin ${label}] Notion error:`, err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }
    if (!resolved) return;

    const { targetUser, character } = resolved;
    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const ctx = { targetUser, character, characterName, amount, interaction };

    let result;
    try {
        result = await mutate(ctx);
    } catch (err) {
        console.error(`[leagueadmin ${label}] Notion update error:`, err);
        return interaction.editReply({ content: `❌ Failed to update ${label}. Please try again.` });
    }
    if (result && result.blocked) {
        return interaction.editReply({ content: result.blocked });
    }

    await sendAdminLog(interaction.guild, buildEmbed(ctx, result));
    return interaction.editReply({ content: buildReply(ctx, result) });
}

// ─── /leagueadmin rep ─────────────────────────────────────────────────────────

async function handleAdminRep(interaction) {
    return runAdminGrant(interaction, {
        label: 'rep',
        getAmount: i => i.options.getInteger('amount'),
        validateAmount: amount => amount > REP_MAX
            ? `❌ You cannot grant more than **${REP_MAX} reputation** at once. Please contact a mod if more is needed.`
            : null,
        mutate: async ({ character, amount }) => {
            const currentRep = character.properties['Reputation Points']?.number ?? 0;
            await adjustCharacterNumber(character.id, 'Reputation Points', amount);
            return { newTotal: currentRep + amount };
        },
        buildEmbed: ({ targetUser, characterName, amount, interaction }, { newTotal }) =>
            new EmbedBuilder()
                .setColor(0xffa500)
                .setTitle('⭐ Reputation Granted')
                .addFields(
                    { name: 'Character',  value: characterName,               inline: true },
                    { name: 'Player',     value: `<@${targetUser.id}>`,       inline: true },
                    { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Amount',     value: `+${amount}`,                inline: true },
                    { name: 'New Total',  value: `${newTotal}`,               inline: true },
                )
                .setTimestamp(),
        buildReply: ({ characterName, amount }) => `✅ Granted **${amount} reputation** to **${characterName}**.`,
    });
}


// ─── /leagueadmin gold ────────────────────────────────────────────────────────

async function handleAdminGold(interaction) {
    return runAdminGrant(interaction, {
        label: 'gold',
        getAmount: i => i.options.getNumber('amount'),
        mutate: async ({ character, characterName, amount }) => {
            const currentGold = character.properties['Gold']?.number ?? 0;
            const newGold = currentGold + amount;
            if (newGold < 0) {
                return { blocked: `❌ This would put **${characterName}** below 0 gp. Current balance: **${currentGold} gp**.` };
            }
            await adjustCharacterNumber(character.id, 'Gold', amount);
            return { newGold };
        },
        buildEmbed: ({ targetUser, characterName, amount, interaction }, { newGold }) =>
            new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle('💰 Gold Grant')
                .addFields(
                    { name: 'Character',  value: characterName,               inline: true },
                    { name: 'Player',     value: `<@${targetUser.id}>`,       inline: true },
                    { name: 'Granted By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Amount',     value: `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`, inline: true },
                    { name: 'New Total',  value: `${formatCurrency(newGold)}`, inline: true },
                )
                .setTimestamp(),
        buildReply: ({ amount, characterName }, { newGold }) =>
            `✅ Adjusted gold by **${amount > 0 ? '+' : ''}${formatCurrency(amount)}** for **${characterName}**. New balance: **${formatCurrency(newGold)}**.`,
    });
}

// ─── /leagueadmin milestone ───────────────────────────────────────────────────

async function handleAdminMilestone(interaction, client) {
    return runAdminGrant(interaction, {
        label: 'milestone',
        getAmount: i => i.options.getInteger('amount'),
        mutate: ({ character, characterName, amount }) =>
            applyMilestones(client, interaction.guild, character, characterName, amount),
        buildEmbed: ({ targetUser, characterName, amount, interaction }, result) => {
            const { currentLevel, newLevel, milestonesConsumed, milestonesRemaining, levelUps } = result;
            const embedFields = [
                { name: 'Character',            value: characterName,               inline: true },
                { name: 'Player',               value: `<@${targetUser.id}>`,       inline: true },
                { name: 'Granted By',           value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Milestones Granted',   value: `+${amount}`,                inline: true },
                { name: 'Milestones Consumed',  value: `${milestonesConsumed}`,     inline: true },
                { name: 'Milestones Remaining', value: `${milestonesRemaining}`,    inline: true },
            ];
            if (levelUps > 0) {
                embedFields.push({ name: 'Level', value: `${currentLevel} → ${newLevel}`, inline: true });
            }
            return new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('🏆 Milestone Granted')
                .addFields(...embedFields)
                .setTimestamp();
        },
        buildReply: ({ characterName, amount }, { newLevel, levelUps }) => {
            const levelMsg = levelUps > 0 ? ` **${characterName}** levelled up to **Level ${newLevel}**!` : '';
            return `✅ Granted **${amount} milestone(s)** to **${characterName}**.${levelMsg}`;
        },
    });
}

// ─── Shared DM multi-target grant executor ─────────────────────────────────────

async function runDMGrant(interaction, config) {
    const {
        label, entryType, buildEmbedTitle, embedColor,
        amountGetter = 'getInteger', validatePair, buildPayload, buildFields,
    } = config;

    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }

    const pairs = extractPairs(interaction, amountGetter);
    const results = [];
    const embedFields = [];
    let anyOffQuest = false;

    for (const pair of pairs) {
        const { user, amount } = pair;

        if (validatePair) {
            const skipReason = validatePair(pair);
            if (skipReason) {
                results.push(skipReason);
                continue;
            }
        }

        let character;
        try {
            character = await getActiveCharacter(user.id);
        } catch (err) {
            console.error(`[leaguedm ${label}] Notion error:`, err);
            results.push(`❌ **${user.username}** — database error, skipped.`);
            continue;
        }

        if (!character) {
            results.push(`❌ **${user.username}** — no active character found, skipped.`);
            continue;
        }

        const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const onQuest = quest.characterIds.includes(character.id);
        if (!onQuest) anyOffQuest = true;

        const payload = buildPayload({ character, characterName, amount });

        const entry = addAction({
            type: entryType,
            dm: { discordId: interaction.user.id, username: interaction.user.username },
            target: {
                discordId: user.id,
                username:  user.username,
                characterName,
                characterPageId: character.id,
            },
            quest: { questId: quest.questId, questName: quest.questName, questPageId: quest.questPageId },
            payload,
        });

        embedFields.push(...buildFields({ user, characterName, amount, onQuest, entry, payload }));

        results.push(onQuest
            ? `✅ **${characterName}** — pending approval. ID: \`${entry.id}\``
            : `⚠️ **${characterName}** — pending approval (not on quest roster). ID: \`${entry.id}\``
        );
    }

    if (embedFields.length > 0) {
        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(embedColor(anyOffQuest))
            .setTitle(buildEmbedTitle)
            .setDescription(`Quest: ${quest.questName} (\`${quest.questId}\`)\nRequested by <@${interaction.user.id}>`)
            .addFields(...embedFields)
            .setTimestamp()
        );
    }

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leaguedm rep ────────────────────────────────────────────────────────────

async function handleDMRep(interaction) {
    return runDMGrant(interaction, {
        label: 'rep',
        entryType: 'reputation',
        buildEmbedTitle: '⏳ Reputation Grants — Pending Approval',
        embedColor: anyOffQuest => anyOffQuest ? 0xf1c40f : 0x5865f2,
        validatePair: ({ user, amount }) => amount > REP_MAX
            ? `❌ **${user.username}** — amount exceeds max (${REP_MAX}), skipped. Contact a mod.`
            : null,
        buildPayload: ({ character, amount }) => ({
            amount,
            currentRep: character.properties['Reputation Points']?.number ?? 0,
        }),
        buildFields: ({ user, characterName, amount, onQuest, entry, payload }) => [
            { name: characterName, value: `+${amount} (was ${payload.currentRep})${onQuest ? '' : ' ⚠️ not on roster'}`, inline: true },
            { name: 'Player',      value: `<@${user.id}>`,   inline: true },
            { name: 'Action ID',   value: `\`${entry.id}\``, inline: true },
        ],
    });
}

// ─── /leaguedm gold ───────────────────────────────────────────────────────────

async function handleDMGold(interaction) {
    return runDMGrant(interaction, {
        label: 'gold',
        entryType: 'gold',
        amountGetter: 'getNumber',
        buildEmbedTitle: '⏳ Gold Grants — Pending Approval',
        embedColor: () => 0xf1c40f,
        validatePair: ({ user, amount }) => amount < 0
            ? `❌ **${user.username}** — DMs cannot grant negative gold, skipped.`
            : null,
        buildPayload: ({ character, amount }) => ({
            amount,
            currentGold: character.properties['Gold']?.number ?? 0,
        }),
        buildFields: ({ user, characterName, amount, onQuest, entry, payload }) => [
            { name: characterName, value: `+${amount} gp (was ${payload.currentGold} gp)`, inline: true },
            { name: 'Player',      value: `<@${user.id}>`,   inline: true },
            { name: 'Action ID',   value: `\`${entry.id}\``, inline: true },
            ...(onQuest ? [] : [{ name: '⚠️', value: 'Not on quest roster', inline: true }]),
        ],
    });
}

// ─── /leaguedm milestone ──────────────────────────────────────────────────────

async function handleDMMilestone(interaction) {
    return runDMGrant(interaction, {
        label: 'milestone',
        entryType: 'milestone',
        buildEmbedTitle: '⏳ Milestone Grants — Pending Approval',
        embedColor: anyOffQuest => anyOffQuest ? 0xf1c40f : 0x5865f2,
        buildPayload: ({ character, amount }) => ({
            amount,
            currentMilestones: character.properties['Milestones']?.number ?? 0,
            currentLevel: character.properties['Level']?.number ?? 1,
        }),
        buildFields: ({ user, characterName, amount, onQuest, entry, payload }) => [
            { name: characterName, value: `+${amount} (Lvl ${payload.currentLevel}, was ${payload.currentMilestones} ms)${onQuest ? '' : ' ⚠️ not on roster'}`, inline: true },
            { name: 'Player',      value: `<@${user.id}>`,   inline: true },
            { name: 'Action ID',   value: `\`${entry.id}\``, inline: true },
        ],
    });
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
            outputResult = await applyDowntimeOutput({ output: blueprint.output, characterPageId: characterRelId, activityName, tierValue }, leagueNotion, interaction.client, interaction.guild);
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

// ─── Shared admin item-grant executor ──────────────────────────────────────────

async function resolveItemAssignment(interaction, label) {
    const targetUser = interaction.options.getUser('player');
    if (!targetUser) return { targetUser: null, characterPageId: null, characterName: null };

    let character;
    try {
        character = await getActiveCharacter(targetUser.id);
    } catch (err) {
        console.error(`[${label}] Notion error:`, err);
        throw { userMessage: '❌ Could not reach the database. Please try again.' };
    }
    if (!character) {
        throw { userMessage: `❌ **${targetUser.displayName}** does not have an active character.` };
    }
    return {
        targetUser,
        characterPageId: character.id,
        characterName: character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown',
    };
}

async function runAdminItemGrant(interaction, config) {
    const { label, replyVerb, embedTitle, resolveItem, successMessage } = config;

    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const resolvedItem = resolveItem(interaction);
    if (resolvedItem.error) return interaction.editReply({ content: resolvedItem.error });
    const { itemName, type, rarity, subtype, itemValue, source, notes, extraEmbedFields = [] } = resolvedItem;

    let assignment;
    try {
        assignment = await resolveItemAssignment(interaction, `leagueadmin ${label}`);
    } catch (err) {
        return interaction.editReply({ content: err.userMessage });
    }
    const { targetUser, characterPageId, characterName } = assignment;

    let page;
    try {
        page = await createInventoryItem({
            itemName, type, rarity, subtype, itemValue, source, notes,
            characterPageId,
            status: characterPageId ? 'Owned' : 'Stored',
        });
    } catch (err) {
        console.error(`[leagueadmin ${label}] Notion create error:`, err);
        return interaction.editReply({ content: `❌ Failed to ${replyVerb.toLowerCase()} item. Please try again.` });
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(embedTitle)
        .addFields(
            { name: 'Item',        value: itemName,                       inline: true },
            { name: 'Type',        value: `${type}${subtype ? ` — ${subtype}` : ''}`, inline: true },
            { name: 'Rarity',      value: rarity,                         inline: true },
            ...extraEmbedFields,
            { name: `${replyVerb} By`, value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Assigned To', value: characterName ? `${characterName} (<@${targetUser.id}>)` : 'Unassigned', inline: true },
            { name: 'Notion ID',   value: `\`${page.id}\``,               inline: false },
        )
        .setTimestamp()
    );

    const assignedMsg = characterName ? ` Assigned to **${characterName}**.` : ' Item is unassigned.';
    return interaction.editReply({ content: successMessage(itemName, assignedMsg, resolvedItem) });
}

// ─── /leagueadmin item create ──────────────────────────────────────────────────────────────────

async function handleAdminItemCreate(interaction) {
    return runAdminItemGrant(interaction, {
        label: 'item create',
        replyVerb: 'Created',
        embedTitle: '🎒 Item Created',
        resolveItem: i => ({
            itemName:  i.options.getString('name'),
            type:      i.options.getString('type'),
            rarity:    i.options.getString('rarity'),
            subtype:   i.options.getString('subtype'),
            itemValue: i.options.getInteger('value'),
            source:    i.options.getString('source'),
            notes:     i.options.getString('notes'),
        }),
        successMessage: (itemName, assignedMsg) => `✅ Created **${itemName}**.${assignedMsg}`,
    });
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
    return runAdminItemGrant(interaction, {
        label: 'item import',
        replyVerb: 'Imported',
        embedTitle: '🎒 Item Imported From Catalogue',
        resolveItem: i => {
            const code = i.options.getString('code');
            const valueOverride = i.options.getInteger('value');
            const notesOverride = i.options.getString('notes');
            const resolved = resolveCatalogueImport(code, { itemValue: valueOverride, notes: notesOverride });
            if (resolved.error) return { error: resolved.error };
            return {
                ...resolved,
                source: i.options.getString('source'),
                extraEmbedFields: [{ name: 'Catalogue Code', value: `\`${resolved.catalogueCode}\``, inline: true }],
            };
        },
        successMessage: (itemName, assignedMsg, resolvedItem) =>
            `✅ Imported **${itemName}** from the catalogue (\`${resolvedItem.catalogueCode}\`).${assignedMsg}`,
    });
}

// ─── Shared DM item-grant executor ─────────────────────────────────────────────

async function runDMItemGrant(interaction, config) {
    const { label, embedTitle, resolveItem, entryPrefix } = config;

    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }

    const resolvedItem = resolveItem(interaction);
    if (resolvedItem.error) return interaction.editReply({ content: resolvedItem.error });
    const { itemName, type, rarity, subtype, itemValue, source, notes, extraEmbedFields = [] } = resolvedItem;

    const targetUser = interaction.options.getUser('player');

    let character;
    try {
        character = await getActiveCharacter(targetUser.id);
    } catch (err) {
        console.error(`[leaguedm ${label}] Notion error:`, err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }
    if (!character) {
        return interaction.editReply({ content: `❌ **${targetUser.displayName}** does not have an active character.` });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const onQuest = quest.characterIds.includes(character.id);

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
        ...extraEmbedFields,
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
        .setTitle(embedTitle)
        .addFields(...embedFields)
        .setTimestamp()
    );

    return interaction.editReply({ content: onQuest
        ? `✅ ${entryPrefix(itemName, resolvedItem)} for **${characterName}** — pending approval. ID: \`${entry.id}\``
        : `⚠️ ${entryPrefix(itemName, resolvedItem)} for **${characterName}** — pending approval (not on quest roster). ID: \`${entry.id}\``
    });
}

// ─── /leaguedm item create ──────────────────────────────────────────────────────────────────

async function handleDMItemCreate(interaction) {
    return runDMItemGrant(interaction, {
        label: 'item create',
        embedTitle: '⏳ Item Grant — Pending Approval',
        resolveItem: i => ({
            itemName:  i.options.getString('name'),
            type:      i.options.getString('type'),
            rarity:    i.options.getString('rarity'),
            subtype:   i.options.getString('subtype'),
            itemValue: i.options.getInteger('value'),
            source:    i.options.getString('source'),
            notes:     i.options.getString('notes'),
        }),
        entryPrefix: itemName => `**${itemName}**`,
    });
}

// ─── /leaguedm item import ──────────────────────────────────────────────────────────────────

async function handleDMItemImport(interaction) {
    return runDMItemGrant(interaction, {
        label: 'item import',
        embedTitle: '⏳ Item Grant (Catalogue Import) — Pending Approval',
        resolveItem: i => {
            const code = i.options.getString('code');
            const source = i.options.getString('source');
            const notesOverride = i.options.getString('notes');
            const resolved = resolveCatalogueImport(code, { notes: notesOverride });
            if (resolved.error) return { error: resolved.error };
            return {
                ...resolved,
                source,
                extraEmbedFields: [{ name: 'Catalogue Code', value: `\`${resolved.catalogueCode}\``, inline: true }],
            };
        },
        entryPrefix: (itemName, resolvedItem) => `**${itemName}** (imported from \`${resolvedItem.catalogueCode}\`)`,
    });
}

// ─── /leagueadmin audit characters ─────────────────────────────────────────────

async function handleAdminAuditCharacters(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ This command can only be used in the league admin channel.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    let result;
    try {
        result = await findCharacterStatusIssues();
    } catch (err) {
        console.error('[leagueadmin audit characters] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }

    const { violations, noActive } = result;

    const nameOf = c => c.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    const embed = new EmbedBuilder()
        .setColor(violations.length > 0 ? 0xed4245 : 0x57f287)
        .setTitle('🔍 Character Status Audit')
        .setTimestamp();

    if (violations.length === 0) {
        embed.addFields({ name: '✅ No violations', value: 'No Discord ID has more than one Active character.' });
    } else {
        const violationLines = violations.map(v =>
            `<@${v.discordId}> — ${v.characters.map(c => `**${nameOf(c)}**`).join(', ')} are all Active`
        );
        embed.addFields({
            name: `⚠️ ${violations.length} violation(s) — multiple Active characters`,
            value: violationLines.join('\n').slice(0, 1024),
        });
    }

    if (noActive.length > 0) {
        const infoLines = noActive.map(v =>
            `<@${v.discordId}> — ${v.characters.map(c => `${nameOf(c)} (${c.properties['Status']?.select?.name ?? 'Unknown'})`).join(', ')}`
        );
        embed.addFields({
            name: `ℹ️ ${noActive.length} informational — no Active character`,
            value: infoLines.join('\n').slice(0, 1024),
        });
    }

    return interaction.editReply({ embeds: [embed] });
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
	if (group === 'audit') {
		if (sub === 'characters') return handleAdminAuditCharacters(interaction);
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
