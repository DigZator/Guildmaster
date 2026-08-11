const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { decodeId, encodeId } = require('../interactions/questDashboardId');
const { loadDashboardState, renderMainView } = require('../interactions/questDashboardRender');
const { addAction } = require('../utils/pendingActions');
const { sendAdminLog } = require('../utils/adminLog');
const { attachDashboardExpiry } = require('../utils/dashboardExpiry');
const questDrafts = require('../utils/questDrafts');
const { REP_MAX } = require('../commands/leagueGrants');
const { searchCatalogue, getCatalogueItemByCode, defaultPriceFor, inferSubtype } = require('../utils/5etoolsCatalogue');
const { formatCurrency } = require('../utils/currency');
const { getActiveCharacter, getCharacterInventory, getCharacterQuestLog } = require('../utils/leagueNotion');
const { addCharacterToRoster, removeCharactersFromRoster, getQuestSummary, buildQuestSummaryEmbed, confirmQuestCompletion } = require('../commands/leagueQuest');

const BULK_PAGE_SIZE = 5; 
const REWARD_TYPE_LABELS = { gold: 'Gold', rep: 'Reputation', milestone: 'Milestones', item: 'Item' };

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

// Add Reward — item

async function showItemPlayerSelect(interaction, questId, dashboardMessageId) {
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

    const options = state.roster.slice(0, 25).map(c => ({ label: c.characterName.slice(0, 100), value: c.characterPageId }));
    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'addItemPlayer', dashboardMessageId))
        .setPlaceholder('Which character?')
        .addOptions(options);

    return interaction.editReply({
        content: 'Which character is this item for?',
        components: [new ActionRowBuilder().addComponents(select), navRow(questId, 'addReward', dashboardMessageId)],
    });
}

function renderItemActionSelect(questId, characterPageId, dashboardMessageId) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'addItemAction', `${characterPageId}|${dashboardMessageId}`))
        .setPlaceholder('Add or remove an item?')
        .addOptions(
            { label: 'Add Item',    value: 'add',    emoji: '➕' },
            { label: 'Remove Item', value: 'remove', emoji: '➖' },
        );

    return {
        content: 'Add a new item, or remove one already queued?',
        components: [
            new ActionRowBuilder().addComponents(select),
            navRow(questId, 'itemBackToPlayer', dashboardMessageId),
        ],
    };
}

async function handleAddItemPlayerSelect(interaction, questId, dashboardMessageId) {
    const characterPageId = interaction.values[0];
    return interaction.update(renderItemActionSelect(questId, characterPageId, dashboardMessageId));
}

async function handleItemBackToPlayer(interaction, questId, dashboardMessageId) {
    return showItemPlayerSelect(interaction, questId, dashboardMessageId);
}

function buildManualItemModal(questId, characterPageId, dashboardMessageId, sourceTag, prefill = {}) {
    const modal = new ModalBuilder()
        .setCustomId(encodeId(questId, 'addItemModal', `${characterPageId}|${dashboardMessageId}|${sourceTag}`))
        .setTitle(sourceTag === 'catalogue' ? 'Confirm Item' : 'Add Item (Manual)')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('itemName').setLabel('Item Name').setStyle(TextInputStyle.Short)
                    .setRequired(true).setValue(prefill.itemName ?? ''),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('itemType').setLabel('Type').setStyle(TextInputStyle.Short)
                    .setRequired(false).setValue(prefill.itemType ?? ''),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('itemSubtype').setLabel('Subtype').setStyle(TextInputStyle.Short)
                    .setRequired(false).setValue(prefill.itemSubtype ?? ''),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('itemRarity').setLabel('Rarity').setStyle(TextInputStyle.Short)
                    .setRequired(false).setValue(prefill.itemRarity ?? ''),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('itemValue').setLabel('Value (gp)').setStyle(TextInputStyle.Short)
                    .setRequired(false).setValue(prefill.itemValue ?? ''),
            ),
        );
    return modal;
}

async function handleAddItemActionSelect(interaction, questId, extra) {
    const [characterPageId, dashboardMessageId] = extra.split('|');
    const action = interaction.values[0];

    if (action === 'add') {
        const select = new StringSelectMenuBuilder()
            .setCustomId(encodeId(questId, 'addItemSource', `${characterPageId}|${dashboardMessageId}`))
            .setPlaceholder('How do you want to add this item?')
            .addOptions(
                { label: 'Search Catalogue', value: 'catalogue', emoji: '📖' },
                { label: 'Manual Entry',     value: 'manual',    emoji: '✏️' },
            );
        return interaction.update({
            content: 'Search the 5etools catalogue, or enter the item manually?',
            components: [
                new ActionRowBuilder().addComponents(select),
                navRow(questId, 'itemBackToAction', extra),
            ],
        });
    }

    // remove
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

    const itemLines = state.draft.lines.filter(l => l.type === 'item' && l.characterPageId === characterPageId);
    if (itemLines.length === 0) {
        return interaction.editReply({
            content: 'This character has no items queued yet.',
            components: [navRow(questId, 'itemBackToAction', extra)],
        });
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'addItemRemoveSelect', `${characterPageId}|${dashboardMessageId}`))
        .setPlaceholder('Which item to remove?')
        .addOptions(itemLines.slice(0, 25).map(l => ({
            label: (l.payload.itemName ?? 'Unknown item').slice(0, 100),
            value: l.lineId,
        })));

    return interaction.editReply({
        content: 'Which item should be removed?',
        components: [
            new ActionRowBuilder().addComponents(select),
            navRow(questId, 'itemBackToAction', extra),
        ],
    });
}

async function handleItemBackToAction(interaction, questId, extra) {
    const [characterPageId, dashboardMessageId] = extra.split('|');
    await interaction.deferUpdate();
    return interaction.editReply(renderItemActionSelect(questId, characterPageId, dashboardMessageId));
}

async function handleAddItemSourceSelect(interaction, questId, extra) {
    const [characterPageId, dashboardMessageId] = extra.split('|');
    const source = interaction.values[0];

    if (source === 'manual') {
        return interaction.showModal(buildManualItemModal(questId, characterPageId, dashboardMessageId, 'manual'));
    }

    // catalogue
    const modal = new ModalBuilder()
        .setCustomId(encodeId(questId, 'addItemSearch', `${characterPageId}|${dashboardMessageId}`))
        .setTitle('Search Catalogue')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('query').setLabel('Item name (or part of it)')
                    .setStyle(TextInputStyle.Short).setRequired(true),
            ),
        );
    return interaction.showModal(modal);
}

async function handleAddItemRetrySearch(interaction, questId, extra) {
    const modal = new ModalBuilder()
        .setCustomId(encodeId(questId, 'addItemSearch', extra))
        .setTitle('Search Catalogue')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('query').setLabel('Item name (or part of it)')
                    .setStyle(TextInputStyle.Short).setRequired(true),
            ),
        );
    return interaction.showModal(modal);
}

async function handleAddItemSearchModalSubmit(interaction, questId, extra) {
    const [characterPageId, dashboardMessageId] = extra.split('|');
    const query = interaction.fields.getTextInputValue('query').trim();

    if (!query) {
        return interaction.reply({ content: '❌ Enter something to search for.', flags: 64 });
    }

    const matches = searchCatalogue(query, { limit: 25 });

    if (matches.length === 0) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(encodeId(questId, 'addItemRetrySearch', `${characterPageId}|${dashboardMessageId}`))
                .setLabel('Search Again')
                .setStyle(ButtonStyle.Secondary),
        );
        return interaction.reply({
            content: `❌ No catalogue matches for "${query}". Try a different search, or reopen Add Item and pick Manual Entry instead.`,
            components: [row],
            flags: 64,
        });
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'addItemCatalogueSelect', `${characterPageId}|${dashboardMessageId}`))
        .setPlaceholder('Which item?')
        .addOptions(matches.map(item => ({
            label: item.name.slice(0, 100),
            description: `${item.rarity} ${item.type} — ${formatCurrency(item.priceGp ?? defaultPriceFor(item.rarity))}`.slice(0, 100),
            value: item.code,
        })));

    return interaction.reply({
        content: `Found ${matches.length} match(es) for "${query}":`,
        components: [new ActionRowBuilder().addComponents(select)],
        flags: 64,
    });
}

async function handleAddItemCatalogueSelect(interaction, questId, extra) {
    const [characterPageId, dashboardMessageId] = extra.split('|');
    const code = interaction.values[0];
    const item = getCatalogueItemByCode(code);

    if (!item) {
        return interaction.update({ content: '❌ That item is no longer in the catalogue. Try searching again.', components: [] });
    }

    const prefill = {
        itemName: item.name,
        itemType: item.type ?? '',
        itemSubtype: inferSubtype(item) ?? '',
        itemRarity: item.rarity ?? '',
        itemValue: item.priceGp != null ? String(item.priceGp) : String(defaultPriceFor(item.rarity)),
    };

    return interaction.showModal(buildManualItemModal(questId, characterPageId, dashboardMessageId, 'catalogue', prefill));
}

async function handleAddItemModalSubmit(interaction, questId, extra) {
    await interaction.deferUpdate();

    const [characterPageId, dashboardMessageId, sourceTag] = extra.split('|');

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message, embeds: [], components: [] });
    }

    const character = state.roster.find(c => c.characterPageId === characterPageId);
    if (!character) {
        return interaction.editReply({ content: '❌ That character is no longer on this quest\'s roster.', embeds: [], components: [] });
    }

    const itemName = interaction.fields.getTextInputValue('itemName').trim();
    const itemType = interaction.fields.getTextInputValue('itemType').trim() || null;
    const itemSubtype = interaction.fields.getTextInputValue('itemSubtype').trim() || null;
    const itemRarity = interaction.fields.getTextInputValue('itemRarity').trim() || null;
    const rawValue = interaction.fields.getTextInputValue('itemValue').trim();

    let itemValue = null;
    if (rawValue !== '') {
        itemValue = Number(rawValue);
        if (isNaN(itemValue)) {
            return interaction.editReply({ content: `❌ "${rawValue}" isn't a valid number for Value (gp).`, embeds: [], components: [] });
        }
    }

    const source = sourceTag === 'catalogue' ? 'Dashboard (catalogue)' : 'Dashboard (manual entry)';

    try {
        questDrafts.addOrReplaceLine(questId, {
            characterPageId: character.characterPageId,
            characterName: character.characterName,
            discordId: character.discordId,
            type: 'item',
            payload: {
                itemName, type: itemType, subtype: itemSubtype, rarity: itemRarity, itemValue,
                source, notes: null,
            },
        });
    } catch (err) {
        console.error(`[questDashboard] Error saving item line for quest ${questId}:`, err);
        return interaction.editReply({
            content: `⚠️ "${itemName}" looked valid, but I couldn't save it right now. Please try again in a moment.`,
            embeds: [], components: [],
        });
    }

    await refreshDashboardMessage(interaction, questId, dashboardMessageId);
    return finishAndDelete(interaction, { content: `✅ **${itemName}** added for **${character.characterName}**.` });
}

async function handleAddItemRemoveSelect(interaction, questId, extra) {
    await interaction.deferUpdate();

    const [characterPageId, dashboardMessageId] = extra.split('|');
    const lineId = interaction.values[0];

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

    questDrafts.removeLine(questId, lineId);
    await refreshDashboardMessage(interaction, questId, dashboardMessageId);
    return finishAndDelete(interaction, { content: '🗑️ Item removed.', components: [] });
}

// Edit Party

async function handleEditParty(interaction, questId) {
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

    const dashboardMessageId = interaction.message.id;
    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'partyAction', dashboardMessageId))
        .setPlaceholder('Add or remove a party member?')
        .addOptions(
            { label: 'Add Character',    value: 'add',    emoji: '➕' },
            { label: 'Remove Character', value: 'remove', emoji: '➖' },
        );

    return interaction.editReply({
        content: 'Add a character to the roster, or remove one?',
        components: [new ActionRowBuilder().addComponents(select), backRow(questId)],
    });
}

async function handlePartyActionSelect(interaction, questId, dashboardMessageId) {
    const action = interaction.values[0];

    if (action === 'add') {
        const select = new UserSelectMenuBuilder()
            .setCustomId(encodeId(questId, 'partyAddUser', dashboardMessageId))
            .setPlaceholder('Which player?');

        return interaction.update({
            content: 'Select the player whose **active character** should be added.',
            components: [new ActionRowBuilder().addComponents(select), navRow(questId, 'editParty')],
        });
    }

    // remove
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

    if (state.roster.length === 0) {
        return interaction.editReply({
            content: 'This quest has no characters on the roster yet.',
            components: [navRow(questId, 'editParty')],
        });
    }

    const options = [
        { label: '🗑️ Remove All Characters', value: '__all__', description: `Clears all ${state.roster.length} character(s) and their queued rewards` },
        ...state.roster.slice(0, 24).map(c => ({ label: c.characterName.slice(0, 100), value: c.characterPageId })),
    ];

    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'partyRemoveSelect', dashboardMessageId))
        .setPlaceholder('Which character to remove?')
        .addOptions(options);

    return interaction.editReply({
        content: 'Which character should be removed from the roster?',
        components: [new ActionRowBuilder().addComponents(select), navRow(questId, 'editParty')],
    });
}

// Edit Party — Add

async function handlePartyAddUserSelect(interaction, questId, dashboardMessageId) {
    await interaction.deferUpdate();

    const userId = interaction.values[0];

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

    const character = await getActiveCharacter(userId).catch(() => null);
    if (!character) {
        return interaction.editReply({
            content: `❌ <@${userId}> has no active character. Ask them to set one before adding them to this quest.`,
            components: [],
        });
    }

    const charName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    if (state.roster.some(c => c.characterPageId === character.id)) {
        return interaction.editReply({ content: `⚠️ **${charName}** is already on this quest's roster.`, components: [] });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyAddConfirm', `${character.id}|${dashboardMessageId}`))
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyAddCancel', dashboardMessageId))
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
        content: `This will add **${charName}** — <@${userId}>'s active character — to the roster. Is this correct?\n` +
            `If not, ask <@${userId}> to switch their active character to the right one and try again.`,
        components: [row],
    });
}

async function handlePartyAddConfirm(interaction, questId, extra) {
    await interaction.deferUpdate();

    const [characterId, dashboardMessageId] = extra.split('|');

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

    let result;
    try {
        result = await addCharacterToRoster(state.quest, characterId);
    } catch (err) {
        console.error(`[questDashboard] Error adding character ${characterId} to quest ${questId}:`, err);
        return interaction.editReply({ content: '❌ Failed to add character — check logs.', components: [] });
    }

    await refreshDashboardMessage(interaction, questId, dashboardMessageId);

    return finishAndDelete(interaction, {
        content: result.alreadyPresent ? '⚠️ Already on the roster — nothing changed.' : '✅ Character added to the roster.',
        components: [],
    });
}

async function handlePartyAddCancel(interaction) {
    return finishAndDelete(interaction, { content: 'Cancelled — nothing changed.', components: [] });
}

// Edit Party — Remove

async function handlePartyRemoveSelect(interaction, questId, dashboardMessageId) {
    await interaction.deferUpdate();

    const target = interaction.values[0];

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

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyRemoveConfirm', `${target}|${dashboardMessageId}`))
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyRemoveCancel', dashboardMessageId))
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );

    if (target === '__all__') {
        const lineCount = state.draft.lines.length;
        const warning = lineCount > 0
            ? `Removing all characters will also remove all **${lineCount}** queued reward line(s). `
            : '';
        return interaction.editReply({
            content: `⚠️ Are you sure you want to remove **all ${state.roster.length} character(s)** from this quest's roster? ${warning}This cannot be undone.`,
            components: [row],
        });
    }

    const character = state.roster.find(c => c.characterPageId === target);
    if (!character) {
        return interaction.editReply({ content: '❌ That character is no longer on the roster.', components: [] });
    }

    const lineCount = state.draft.lines.filter(l => l.characterPageId === target).length;
    const warning = lineCount > 0
        ? `⚠️ Removing **${character.characterName}** will also remove their **${lineCount}** queued reward line(s). Remove anyway?`
        : `Remove **${character.characterName}** from the roster?`;

    return interaction.editReply({ content: warning, components: [row] });
}

async function handlePartyRemoveConfirm(interaction, questId, extra) {
    await interaction.deferUpdate();

    const [target, dashboardMessageId] = extra.split('|');

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

    const characterIds = target === '__all__'
        ? state.roster.map(c => c.characterPageId)
        : [target];

    try {
        await removeCharactersFromRoster(state.quest, characterIds);
    } catch (err) {
        console.error(`[questDashboard] Error removing character(s) ${characterIds.join(',')} from quest ${questId}:`, err);
        return interaction.editReply({ content: '❌ Failed to update the roster — check logs.', components: [] });
    }

    // Cascade: drop any draft lines belonging to removed characters.
    for (const line of state.draft.lines) {
        if (characterIds.includes(line.characterPageId)) {
            questDrafts.removeLine(questId, line.lineId);
        }
    }

    await refreshDashboardMessage(interaction, questId, dashboardMessageId);

    return finishAndDelete(interaction, {
        content: target === '__all__'
            ? '✅ All characters removed from the roster.'
            : '✅ Character removed from the roster.',
        components: [],
    });
}

async function handlePartyRemoveCancel(interaction) {
    return finishAndDelete(interaction, { content: 'Cancelled — nothing changed.', components: [] });
}

// Grouping toggle

async function handleToggleGroup(interaction, questId, grouping) {
    await interaction.deferUpdate().catch(() => {});

    const dashboardMessageId = interaction.message.id;

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
    } catch (err) {
        return interaction.followUp({ content: err.message, flags: 64 }).catch(() => {});
    }

    const newMessage = await interaction.channel.send(renderMainView(state.draft, state.roster, { grouping, quest: state.quest }));
    attachDashboardExpiry(newMessage, questId);

    const oldMessage = await interaction.channel.messages.fetch(dashboardMessageId).catch(() => null);
    if (oldMessage) await oldMessage.delete().catch(() => {});
}

// Roster — read-only view

async function buildPartyInfoEmbed(state, index) {
    const character = state.roster[index];
    const total = state.roster.length;

    const [inventory, questLog] = await Promise.all([
        getCharacterInventory(character.characterPageId).catch(() => []),
        getCharacterQuestLog(character.characterPageId).catch(() => []),
    ]);

    const topItems = inventory
        .map(item => ({
            name: item.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown Item',
            value: item.properties['Item Value']?.number ?? 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

    const itemBlock = topItems.length > 0
        ? '```\n' + topItems.map(i => `${i.name.slice(0, 28).padEnd(28)} ${formatCurrency(i.value)}`).join('\n') + '\n```'
        : '_No items in inventory._';

    const lastQuest = questLog.find(q =>
        q.id !== state.quest.id && q.properties['Status']?.select?.name === 'Completed'
    );
    const lastQuestText = lastQuest
        ? `${lastQuest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown'} (${lastQuest.properties['Date']?.date?.start ?? 'unknown date'})`
        : '_No completed quests on record._';

    const lineCount = state.draft.lines.filter(l => l.characterPageId === character.characterPageId).length;

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${character.characterName}${character.discordId ? ` — <@${character.discordId}>` : ''}`)
        .addFields(
            { name: 'Level',                  value: character.level != null ? `${character.level}` : '—', inline: true },
            { name: 'Class',                  value: character.className ?? '—', inline: true },
            { name: 'Species',                value: character.species ?? '—',   inline: true },
            { name: 'Top 3 Items (by value)', value: itemBlock,                  inline: false },
            { name: 'Last Quest',             value: lastQuestText,              inline: false },
        );

    if (lineCount > 0) {
        embed.addFields({ name: 'Queued This Quest', value: `${lineCount} reward line(s)`, inline: false });
    }

    embed.setFooter({ text: `Character ${index + 1} of ${total} — ${state.questName} (${state.questId})` });

    return embed;
}

async function respondPartyInfo(interaction, questId, index, isUpdate) {
    if (isUpdate) {
        await interaction.deferUpdate();
    } else {
        await interaction.deferReply({ flags: 64 });
    }

    let state;
    try {
        state = await loadDashboardState(questId, null);
    } catch (err) {
        return interaction.editReply({ content: err.message, embeds: [], components: [] });
    }

    if (state.roster.length === 0) {
        return interaction.editReply({ content: 'This quest has no characters on the roster yet.', embeds: [], components: [] });
    }

    const safeIndex = Math.max(0, Math.min(index, state.roster.length - 1));
    const embed = await buildPartyInfoEmbed(state, safeIndex);

    const pageNavRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyInfoPage', String(safeIndex - 1)))
            .setLabel('◀ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safeIndex <= 0),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyInfoPage', String(safeIndex + 1)))
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safeIndex >= state.roster.length - 1),
    );

    return interaction.editReply({ content: '', embeds: [embed], components: [pageNavRow, backRow(questId)] });
}

async function handlePartyInfo(interaction, questId) {
    return respondPartyInfo(interaction, questId, 0, false);
}

async function handlePartyInfoPage(interaction, questId, extra) {
    return respondPartyInfo(interaction, questId, parseInt(extra, 10) || 0, true);
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

// Dispatch

async function handleDashboardButton(interaction) {
    const { questId, action, extra } = decodeId(interaction.customId);

    if (action === 'submit')            return handleSubmit(interaction, questId);
    if (action === 'completeConfirm')   return handleCompleteConfirm(interaction, questId, extra);
    if (action === 'completeCancel')    return handleSubmitCancel(interaction);
    if (action === 'submitCancel')      return handleSubmitCancel(interaction);
    if (action === 'addReward')         return handleAddReward(interaction, questId);
    if (action === 'addRewardBulkNext') return handleAddRewardBulkNext(interaction, questId, extra);
    if (action === 'addItemRetrySearch') return handleAddItemRetrySearch(interaction, questId, extra);
    if (action === 'itemBackToPlayer') return handleItemBackToPlayer(interaction, questId, extra);
    if (action === 'itemBackToAction') return handleItemBackToAction(interaction, questId, extra);
    if (action === 'editParty')         return handleEditParty(interaction, questId);
    if (action === 'partyAddConfirm')   return handlePartyAddConfirm(interaction, questId, extra);
    if (action === 'partyAddCancel')    return handlePartyAddCancel(interaction);
    if (action === 'partyRemoveConfirm') return handlePartyRemoveConfirm(interaction, questId, extra);
    if (action === 'partyRemoveCancel') return handlePartyRemoveCancel(interaction);
    if (action === 'toggleGroup')       return handleToggleGroup(interaction, questId, extra);
    if (action === 'partyInfo')         return handlePartyInfo(interaction, questId);
    if (action === 'partyInfoPage')     return handlePartyInfoPage(interaction, questId, extra);
    if (action === 'cancelQuest')        return handleCancelQuest(interaction, questId);
    if (action === 'cancelQuestConfirm') return handleCancelQuestConfirm(interaction, questId);
    if (action === 'cancelQuestReturn')  return handleCancelQuestReturn(interaction);
    if (action === 'backToDashboard')    return handleBackToDashboard(interaction);

    return interaction.reply({ content: '❌ This dashboard control isn\'t wired up yet.', flags: 64 });
}

async function handleDashboardSelect(interaction) {
    const { questId, action, extra } = decodeId(interaction.customId);

    if (action === 'addRewardType')       return handleAddRewardTypeSelect(interaction, questId, extra);
    if (action === 'addItemPlayer')       return handleAddItemPlayerSelect(interaction, questId, extra);
    if (action === 'addItemAction')       return handleAddItemActionSelect(interaction, questId, extra);
    if (action === 'addItemRemoveSelect') return handleAddItemRemoveSelect(interaction, questId, extra);
    if (action === 'addItemSource')       return handleAddItemSourceSelect(interaction, questId, extra);
    if (action === 'addItemCatalogueSelect') return handleAddItemCatalogueSelect(interaction, questId, extra);
    if (action === 'partyAction')         return handlePartyActionSelect(interaction, questId, extra);
    if (action === 'partyRemoveSelect')   return handlePartyRemoveSelect(interaction, questId, extra);

    return interaction.reply({ content: '❌ This dashboard control isn\'t wired up yet.', flags: 64 });
}

async function handleDashboardUserSelect(interaction) {
    const { questId, action, extra } = decodeId(interaction.customId);

    if (action === 'partyAddUser') return handlePartyAddUserSelect(interaction, questId, extra);

    return interaction.reply({ content: '❌ This dashboard control isn\'t wired up yet.', flags: 64 });
}

async function handleDashboardModal(interaction) {
    const { questId, action, extra } = decodeId(interaction.customId);

    if (action === 'addRewardBulk') return handleAddRewardBulkModalSubmit(interaction, questId, extra);
    if (action === 'addItemModal')  return handleAddItemModalSubmit(interaction, questId, extra);
    if (action === 'addItemSearch') return handleAddItemSearchModalSubmit(interaction, questId, extra);

    return interaction.reply({ content: '❌ This dashboard control isn\'t wired up yet.', flags: 64 });
}

module.exports = {
    prefix: { 'questDash:': handleDashboardButton },
    handleDashboardSelect,
    handleDashboardUserSelect,
    handleDashboardModal,
};
