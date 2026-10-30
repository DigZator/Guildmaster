const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { encodeId } = require('../../interactions/questDashboardId');
const { loadDashboardState } = require('../../interactions/questDashboardRender');
const questDrafts = require('../../utils/questDrafts');
const { REP_MAX } = require('../../commands/leagueGrants');
const { assertOwner, assertUnlocked, backRow, refreshDashboardMessage } = require('./common');
const { showItemPlayerSelect } = require('./items');

const BULK_PAGE_SIZE = 5; 
const REWARD_TYPE_LABELS = { gold: 'Gold', rep: 'Reputation', milestone: 'Milestones', item: 'Item' };

// Add Reward
async function handleAddReward(interaction, questId) {
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

    if (state.roster.length === 0) {
        return interaction.editReply({ content: '❌ This quest has no characters yet — add characters before queuing rewards.' });
    }

    const dashboardMessageId = interaction.message.id;
    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'addRewardType', dashboardMessageId))
        .setPlaceholder('What kind of reward?')
        .addOptions(
            { label: 'Gold',         value: 'gold',      emoji: '💰' },
            { label: 'Reputation',   value: 'rep',       emoji: '⭐' },
            { label: 'Milestones',   value: 'milestone', emoji: '🏆' },
            { label: 'Item',         value: 'item',       emoji: '🎒' },
        );

    return interaction.editReply({
        content: 'What kind of reward do you want to add?',
        components: [new ActionRowBuilder().addComponents(select), backRow(questId)],
    });
}

// Add Reward — gold / rep / milestone
function existingAmount(draft, characterPageId, type) {
    const line = draft.lines.find(l => l.characterPageId === characterPageId && l.type === type);
    return line?.payload?.amount ?? 0;
}

function buildBulkAmountModal(questId, rewardType, pageIndex, dashboardMessageId, charactersSlice, draft, totalPages) {
    const modal = new ModalBuilder()
        .setCustomId(encodeId(questId, 'addRewardBulk', `${rewardType}|${pageIndex}|${dashboardMessageId}`))
        .setTitle(`${REWARD_TYPE_LABELS[rewardType]} Rewards${totalPages > 1 ? ` (Page ${pageIndex + 1}/${totalPages})` : ''}`.slice(0, 45));

    for (let i = 0; i < charactersSlice.length; i++) {
        const character = charactersSlice[i];
        const current = existingAmount(draft, character.characterPageId, rewardType);
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`amt${i}`)
                    .setLabel(character.characterName.slice(0, 45))
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setValue(String(current))
                    .setPlaceholder('0'),
            ),
        );
    }

    return modal;
}

async function handleAddRewardTypeSelect(interaction, questId, dashboardMessageId) {
    const rewardType = interaction.values[0];

    if (rewardType === 'item') {
        return showItemPlayerSelect(interaction, questId, dashboardMessageId);
    }

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.update({ content: err.message, components: [] });
    }

    const totalPages = Math.ceil(state.roster.length / BULK_PAGE_SIZE);
    const slice = state.roster.slice(0, BULK_PAGE_SIZE);
    const modal = buildBulkAmountModal(questId, rewardType, 0, dashboardMessageId, slice, state.draft, totalPages);

    return interaction.showModal(modal);
}

async function handleAddRewardBulkModalSubmit(interaction, questId, extra) {
    await interaction.deferReply({ flags: 64 });

    const [rewardType, pageIndexStr, dashboardMessageId] = extra.split('|');
    const pageIndex = parseInt(pageIndexStr, 10);

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

    const slice = state.roster.slice(pageIndex * BULK_PAGE_SIZE, pageIndex * BULK_PAGE_SIZE + BULK_PAGE_SIZE);
    const results = [];

    for (let i = 0; i < slice.length; i++) {
        const character = slice[i];
        const raw = interaction.fields.getTextInputValue(`amt${i}`).trim();
        const amount = raw === '' ? 0 : parseInt(raw, 10);

        if (isNaN(amount)) {
            results.push(`❌ **${character.characterName}** — "${raw}" isn't a number, skipped.`);
            continue;
        }
        if (rewardType === 'gold' && amount < 0) {
            results.push(`❌ **${character.characterName}** — DMs cannot grant negative gold, skipped.`);
            continue;
        }
        if (rewardType === 'rep' && amount > REP_MAX) {
            results.push(`❌ **${character.characterName}** — exceeds max (${REP_MAX}) reputation, skipped. Contact a mod.`);
            continue;
        }

        const existingLine = state.draft.lines.find(l => l.characterPageId === character.characterPageId && l.type === rewardType);

        try {
            if (amount === 0) {
                if (existingLine) {
                    questDrafts.removeLine(questId, existingLine.lineId);
                    results.push(`🗑️ **${character.characterName}** — cleared.`);
                }
                continue;
            }

            questDrafts.addOrReplaceLine(questId, {
                characterPageId: character.characterPageId,
                characterName: character.characterName,
                discordId: character.discordId,
                type: rewardType,
                payload: { amount },
            });
            results.push(`✅ **${character.characterName}** — set to ${amount}.`);
        } catch (err) {
            console.error(`[questDashboard] Error saving ${rewardType} line for quest ${questId}:`, err);
            results.push(`⚠️ **${character.characterName}** — value was valid (${amount}), but I couldn't save it right now. Try again in a moment.`);
        }
    }

    const nextPageIndex = pageIndex + 1;
    const hasMorePages = nextPageIndex * BULK_PAGE_SIZE < state.roster.length;

    if (hasMorePages) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(encodeId(questId, 'addRewardBulkNext', `${rewardType}|${nextPageIndex}|${dashboardMessageId}`))
                .setLabel(`Continue (${REWARD_TYPE_LABELS[rewardType]})`)
                .setStyle(ButtonStyle.Primary),
        );
        return interaction.editReply({
            content: `${results.join('\n')}\n\nMore characters to go — click Continue.`,
            components: [row],
        });
    }

    await refreshDashboardMessage(interaction, questId, dashboardMessageId);
    return interaction.editReply({ content: `${results.join('\n')}\n\n✅ Done.`, components: [] });
}

async function handleAddRewardBulkNext(interaction, questId, extra) {
    const [rewardType, pageIndexStr, dashboardMessageId] = extra.split('|');
    const pageIndex = parseInt(pageIndexStr, 10);

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.reply({ content: err.message, flags: 64 });
    }

    const totalPages = Math.ceil(state.roster.length / BULK_PAGE_SIZE);
    const slice = state.roster.slice(pageIndex * BULK_PAGE_SIZE, pageIndex * BULK_PAGE_SIZE + BULK_PAGE_SIZE);

    if (slice.length === 0) {
        return interaction.reply({ content: '❌ No more characters on this page — the roster may have changed. Reopen Add Reward to try again.', flags: 64 });
    }

    const modal = buildBulkAmountModal(questId, rewardType, pageIndex, dashboardMessageId, slice, state.draft, totalPages);
    return interaction.showModal(modal);
}

module.exports = {
    handleAddReward,
    handleAddRewardTypeSelect,
    handleAddRewardBulkModalSubmit,
    handleAddRewardBulkNext,
};
