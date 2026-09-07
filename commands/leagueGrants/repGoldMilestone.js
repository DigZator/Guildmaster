const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../utils/isAdminChannel');
const { adjustCharacterNumber } = require('../../utils/leagueNotion');
const { applyMilestones } = require('../../utils/milestones');
const { formatCurrency } = require('../../utils/currency');
const { sendAdminLog } = require('../../utils/adminLog');
const { REP_MAX, resolveTarget } = require('./shared');

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

module.exports = {
    handleAdminRep,
    handleAdminGold,
    handleAdminMilestone,
};
