const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildByCharacterEmbed, buildByRewardEmbed, itemAverageValue } = require('../utils/questReportEmbed');
const { encodeId } = require('./questDashboardId');
const { getQuestById } = require('../commands/leagueQuest');
const { getPageById } = require('../utils/leagueNotion');
const { checkGoldAgainstTierLimit } = require('../config/questRewardLimits');
const questDrafts = require('../utils/questDrafts');

const GROUPINGS = Object.freeze(['character', 'reward']);

async function loadDashboardState(questId, requestingUser) {
    const upperId = questId.toUpperCase();

    const quest = await getQuestById(upperId);
    if (!quest) {
        throw new Error(`❌ No quest found with ID \`${upperId}\`.`);
    }

    const questName    = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const characterIds = quest.properties['Characters']?.relation?.map(r => r.id) ?? [];

    const characterPages = await Promise.all(
        characterIds.map(id => getPageById(id).catch(() => null))
    );

    const roster = characterPages
        .filter(Boolean)
        .map(char => ({
            characterPageId: char.id,
            characterName: char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown',
            discordId: char.properties['Discord ID']?.rich_text?.[0]?.plain_text ?? null,
            level: char.properties['Level']?.number ?? null,
            className: char.properties['Class']?.rich_text?.[0]?.plain_text ?? null,
            species: char.properties['Species']?.rich_text?.[0]?.plain_text ?? null,
        }));

    const draft = questDrafts.getDraft(upperId);
    if (!draft) {
        throw new Error(`❌ No active draft for quest \`${upperId}\`. It must be approved (via /leaguedm quest link) before a dashboard exists.`);
    }
    if (draft.dm?.discordId !== requestingUser?.discordId) {
        throw new Error('❌ You are not the DM assigned to this quest.');
    }

    return { quest, questId: upperId, questName, roster, draft };
}

function computeTotalGold(draft) {
    return draft.lines
        .filter(l => l.type === 'gold' && l.lineStatus !== 'rejected')
        .reduce((sum, l) => sum + (l.payload?.amount ?? 0), 0);
}

function computeTotalRewardValue(draft) {
    return draft.lines
        .filter(l => l.lineStatus !== 'rejected' && (l.type === 'gold' || l.type === 'item'))
        .reduce((sum, l) => {
            if (l.type === 'gold') return sum + (l.payload?.amount ?? 0);
            const avg = itemAverageValue(l.payload);
            return sum + (avg ?? 0);
        }, 0);
}

function buildEmbed(draft, roster, grouping, quest) {
    const embed = grouping === 'reward'
        ? buildByRewardEmbed(draft, roster)
        : buildByCharacterEmbed(draft, roster);

    const dmMention = draft.dm?.discordId ? `<@${draft.dm.discordId}>` : 'Unknown';
    const tier      = quest?.properties['Tier']?.select?.name ?? null;
    const totalGold = computeTotalGold(draft);
    const totalRewardValue = computeTotalRewardValue(draft);

    embed.addFields(
        { name: 'DM',                                        value: dmMention,        inline: true },
        { name: 'Tier',                                       value: tier ?? 'Not set', inline: true },
        { name: 'Total Gold Queued',                          value: `${totalGold} gp`, inline: true },
        { name: 'Total Reward (excl. milestones/RP)',         value: `~${Math.round(totalRewardValue)} gp`, inline: true },
    );

    const goldWarning = checkGoldAgainstTierLimit(tier, totalGold);
    if (goldWarning) {
        embed.setDescription((embed.data.description ? `${embed.data.description}\n\n` : '') + goldWarning);
    }

    return embed;
}

function buildActionRows(questId, { locked }) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'addReward'))
            .setLabel('Rewards')
            .setStyle(ButtonStyle.Success)
            .setDisabled(locked),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'editParty'))
            .setLabel('Edit Party')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(locked),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyInfo'))
            .setLabel('Party Info')
            .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'submit'))
            .setLabel('Complete Quest')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(locked),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'cancelQuest'))
            .setLabel('Cancel Quest')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(locked),
    );

    return [row1, row2];
}

function buildGroupingRow(questId, grouping) {
    const next = grouping === 'reward' ? 'character' : 'reward';
    const label = next === 'reward' ? '🔄 Group by Reward Type' : '🔄 Group by Character';

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'toggleGroup', next))
            .setLabel(label)
            .setStyle(ButtonStyle.Secondary),
    );
}

function renderMainView(draft, roster, { grouping = 'character', quest = null } = {}) {
    if (!GROUPINGS.includes(grouping)) {
        throw new Error(`[questDashboardRender] Unknown grouping "${grouping}". Expected one of: ${GROUPINGS.join(', ')}`);
    }

    const TERMINAL_QUEST_STATUSES = ['Completed', 'Cancelled'];
    const questStatus    = quest?.properties['Status']?.select?.name ?? null;
    const questTerminal  = TERMINAL_QUEST_STATUSES.includes(questStatus);
    const locked = draft.status !== 'draft' || questTerminal;
    const embed = buildEmbed(draft, roster, grouping, quest);

    if (locked) {
        embed.setDescription(
            (embed.data.description ? `${embed.data.description}\n\n` : '') +
            (questTerminal
                ? `_This quest is **${questStatus}** and is no longer editable here._`
                : `_This report has been submitted (status: **${draft.status}**) and is no longer editable here._`)
        );
    }

    return {
        embeds: [embed],
        components: [
            ...buildActionRows(draft.questId, { locked }),
            buildGroupingRow(draft.questId, grouping),
        ],
    };
}

module.exports = {
    GROUPINGS,
    renderMainView,
    loadDashboardState,
};
