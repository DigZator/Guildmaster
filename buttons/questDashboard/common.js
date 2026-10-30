const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { encodeId } = require('../../interactions/questDashboardId');
const { loadDashboardState, renderMainView } = require('../../interactions/questDashboardRender');
const { addAction } = require('../../utils/pendingActions');
const { sendAdminLog } = require('../../utils/adminLog');
const { attachDashboardExpiry } = require('../../utils/dashboardExpiry');
const { getQuestSummary, buildQuestSummaryEmbed, confirmQuestCompletion } = require('../../commands/leagueQuest');

function assertOwner(state, interaction) {
    const ownerId = state.draft.dm?.discordId;
    if (ownerId && ownerId !== interaction.user.id) {
        throw new Error(`❌ Only <@${ownerId}> (the DM who started this draft) can edit this report.`);
    }
}

const TERMINAL_QUEST_STATUSES = Object.freeze(['Completed', 'Cancelled']);

function assertUnlocked(state) {
    const questStatus = state.quest.properties['Status']?.select?.name;
    if (TERMINAL_QUEST_STATUSES.includes(questStatus)) {
        throw new Error(`❌ This quest is already **${questStatus}** — no further edits are possible.`);
    }
    if (state.draft.status !== 'draft') {
        throw new Error(`❌ This report is already \`${state.draft.status}\` — refresh the dashboard with \`/leaguedm dashboard\` to see its current state.`);
    }
}

async function finishAndDelete(interaction, payload) {
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply(payload);
    } else {
        await interaction.update(payload);
    }
    return interaction.deleteReply().catch(() => {});
}

function backRow(questId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'backToDashboard'))
            .setLabel('✖️ Close')
            .setStyle(ButtonStyle.Secondary),
    );
}

function navRow(questId, backAction, backExtra) {
    const backButton = new ButtonBuilder()
        .setCustomId(encodeId(questId, backAction, backExtra))
        .setLabel('◀ Back')
        .setStyle(ButtonStyle.Secondary);

    const closeButton = new ButtonBuilder()
        .setCustomId(encodeId(questId, 'backToDashboard'))
        .setLabel('✖️ Close')
        .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder().addComponents(backButton, closeButton);
}

async function handleBackToDashboard(interaction) {
    return finishAndDelete(interaction, {
        content: 'Closed — the dashboard message above is unaffected, click a button on it to start again.',
        embeds: [],
        components: [],
    });
}

async function refreshDashboardMessage(interaction, questId, dashboardMessageId) {
    if (!dashboardMessageId) return;
    try {
        const refreshed  = await loadDashboardState(questId, null);
        const payload    = renderMainView(refreshed.draft, refreshed.roster, { quest: refreshed.quest });

        const newMessage = await interaction.channel.send(payload);
        attachDashboardExpiry(newMessage, questId);

        const oldMessage = await interaction.channel.messages.fetch(dashboardMessageId).catch(() => null);
        if (oldMessage) await oldMessage.delete().catch(() => {});
    } catch (err) {
        console.warn(`[questDashboard] Could not refresh dashboard for quest ${questId}:`, err.message);
    }
}

async function handleSubmit(interaction, questId) {
    await interaction.deferReply({ flags: 64 });

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message });
    }

    const summary = await getQuestSummary(questId);
    if (!summary) {
        return interaction.editReply({ content: `❌ Could not find quest \`${questId}\`. Please contact an admin.` });
    }

    const embed = buildQuestSummaryEmbed(summary, {
        title: '📋 Confirm Quest Completion',
        color: 0xf1c40f,
    });

    const dashboardMessageId = interaction.message.id;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'completeConfirm', dashboardMessageId))
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'completeCancel', dashboardMessageId))
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
        content: `⚠️ This is final — you won't be able to grant any more rewards beyond this point. Whatever's shown as "Queued Rewards" above is exactly what will be granted — a single admin approval covers both the rewards and the completion.`,
        embeds: [embed],
        components: [row],
    });
}

async function handleCompleteConfirm(interaction, questId, dashboardMessageId) {
    await interaction.deferUpdate();

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
    } catch (err) {
        return interaction.editReply({ content: err.message, embeds: [], components: [] });
    }

    const questStatus = state.quest.properties['Status']?.select?.name;
    if (questStatus !== 'Active') {
        return interaction.editReply({
            content: `⚠️ This quest is already **${questStatus}** (probably a duplicate click or it was already handled) — nothing more to do.`,
            embeds: [],
            components: [],
        });
    }

    const dm = state.draft.dm ?? { discordId: interaction.user.id, username: interaction.user.username };
    const entry = await confirmQuestCompletion(state.questId, dm, interaction.guild);

    await refreshDashboardMessage(interaction, state.questId, dashboardMessageId);

    return finishAndDelete(interaction, {
        content: `✅ Quest completion for **${state.questName}** submitted for admin approval (\`${entry.id}\`).`,
        embeds: [],
        components: [],
    });
}

async function handleSubmitCancel(interaction) {
    return finishAndDelete(interaction, { content: 'Quest completion cancelled — nothing changed.', embeds: [], components: [] });
}


// Cancel Quest
async function handleCancelQuest(interaction, questId) {
    await interaction.deferReply({ flags: 64 });

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'cancelQuestConfirm'))
            .setLabel('Confirm Cancel')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'cancelQuestReturn'))
            .setLabel('Return')
            .setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
        content: `⚠️ Are you sure you want to cancel **${state.questName}**? This cannot be undone. ` +
            `The request will be sent to the League Admins for final approval.`,
        components: [row],
    });
}

async function handleCancelQuestConfirm(interaction, questId) {
    await interaction.deferUpdate();

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message, components: [] });
    }

    const entry = addAction({
        type: 'quest-cancel',
        dm: state.draft.dm ?? { discordId: interaction.user.id, username: interaction.user.username },
        quest: { questId: state.questId, questName: state.questName, questPageId: state.quest.id },
        payload: {},
    });

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(`⏳ Quest Cancellation — Pending (${state.questName} \`${state.questId}\`)`)
        .addFields(
            { name: 'Requested By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Action ID',    value: `\`${entry.id}\``,           inline: true },
        )
        .setTimestamp()
    );

    return finishAndDelete(interaction, {
        content: `✅ Cancellation for **${state.questName}** submitted for admin review (\`${entry.id}\`).`,
        components: [],
    });
}

async function handleCancelQuestReturn(interaction) {
    return finishAndDelete(interaction, { content: 'Nothing changed — the quest was not cancelled.', components: [] });
}

module.exports = {
    assertOwner,
    assertUnlocked,
    finishAndDelete,
    backRow,
    navRow,
    handleBackToDashboard,
    refreshDashboardMessage,
    handleSubmit,
    handleCompleteConfirm,
    handleSubmitCancel,
    handleCancelQuest,
    handleCancelQuestConfirm,
    handleCancelQuestReturn,
};
