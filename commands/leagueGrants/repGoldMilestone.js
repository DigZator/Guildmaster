const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../utils/isAdminChannel');
const { adjustCharacterNumber, getActiveCharacter } = require('../../utils/leagueNotion');
const { applyMilestones } = require('../../utils/milestones');
const { formatCurrency } = require('../../utils/currency');
const { sendAdminLog } = require('../../utils/adminLog');
const questDrafts = require('../../utils/questDrafts');
const { DM_ROLE_ID, REP_MAX, ENTRY_TYPE_TO_LINE_TYPE, extractPairs, isDMOnQuest, resolveActiveQuest, resolveTarget } = require('./shared');

async function runAdminGrant(interaction, config) {
    const { label, getAmount, validateAmount, mutate, buildEmbed, buildReply } = config;

    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
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
        label, entryType,
        amountGetter = 'getInteger', validatePair, buildPayload, describeAmount,
    } = config;
    const lineType = ENTRY_TYPE_TO_LINE_TYPE[entryType];

    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }
    if (!isDMOnQuest(interaction, quest.questId)) {
        return interaction.editReply({ content: '❌ You are not the DM assigned to this quest.' });
    }

    questDrafts.getOrCreateDraft(quest.questId, {
        questPageId: quest.questPageId,
        questName: quest.questName,
        dm: { discordId: interaction.user.id, username: interaction.user.username },
    });

    const pairs = extractPairs(interaction, amountGetter);
    const results = [];

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
        const rosterNote = onQuest ? '' : ' ⚠️ not on quest roster';

        const payload = buildPayload({ character, characterName, amount });

        const { replaced, previousPayload } = questDrafts.addOrReplaceLine(quest.questId, {
            characterPageId: character.id,
            characterName,
            discordId: user.id,
            type: lineType,
            payload,
        });

        results.push(replaced
            ? `🔁 **${characterName}** — already had ${describeAmount(previousPayload)} queued for \`${quest.questId}\`. Replaced with your new total: ${describeAmount(payload)}.${rosterNote}`
            : `✅ **${characterName}** — ${describeAmount(payload)} added to the quest draft.${rosterNote}`
        );
    }

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leaguedm rep ────────────────────────────────────────────────────────────
async function handleDMRep(interaction) {
    return runDMGrant(interaction, {
        label: 'rep',
        entryType: 'reputation',
        validatePair: ({ user, amount }) => amount > REP_MAX
            ? `❌ **${user.username}** — amount exceeds max (${REP_MAX}), skipped. Contact a mod.`
            : null,
        buildPayload: ({ character, amount }) => ({
            amount,
            currentRep: character.properties['Reputation Points']?.number ?? 0,
        }),
        describeAmount: payload => `+${payload.amount} rep`,
    });
}

// ─── /leaguedm gold ───────────────────────────────────────────────────────────
async function handleDMGold(interaction) {
    return runDMGrant(interaction, {
        label: 'gold',
        entryType: 'gold',
        amountGetter: 'getNumber',
        validatePair: ({ user, amount }) => amount < 0
            ? `❌ **${user.username}** — DMs cannot grant negative gold, skipped.`
            : null,
        buildPayload: ({ character, amount }) => ({
            amount,
            currentGold: character.properties['Gold']?.number ?? 0,
        }),
        describeAmount: payload => `${payload.amount} gp`,
    });
}

// ─── /leaguedm milestone ──────────────────────────────────────────────────────
async function handleDMMilestone(interaction) {
    return runDMGrant(interaction, {
        label: 'milestone',
        entryType: 'milestone',
        buildPayload: ({ character, amount }) => ({
            amount,
            currentMilestones: character.properties['Milestones']?.number ?? 0,
            currentLevel: character.properties['Level']?.number ?? 1,
        }),
        describeAmount: payload => `${payload.amount} milestone(s)`,
    });
}

module.exports = {
    handleAdminRep,
    handleAdminGold,
    handleAdminMilestone,
    handleDMRep,
    handleDMGold,
    handleDMMilestone,
};
