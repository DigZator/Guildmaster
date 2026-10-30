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
const { searchCatalogue, getCatalogueItemByCode, defaultPriceFor, inferSubtype } = require('../../utils/5etoolsCatalogue');
const { formatCurrency } = require('../../utils/currency');
const { ITEM_TYPE_CHOICES } = require('../../config/itemChoices');
const { setPendingManualItem, getPendingManualItem, clearPendingManualItem } = require('../../utils/pendingManualItems');
const { assertOwner, assertUnlocked, finishAndDelete, navRow, refreshDashboardMessage } = require('./common');

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
                new TextInputBuilder().setCustomId('itemValue').setLabel('Value (gp)').setStyle(TextInputStyle.Short)
                    .setRequired(false).setValue(prefill.itemValue ?? ''),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('itemNotes').setLabel('Notes').setStyle(TextInputStyle.Paragraph)
                    .setRequired(false).setValue(prefill.itemNotes ?? ''),
            ),
        );
    return modal;
}

const NONE_CHOICE_VALUE = '__none__';

function renderManualItemTypeSelect(questId, characterPageId, dashboardMessageId) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'addItemManualType', `${characterPageId}|${dashboardMessageId}`))
        .setPlaceholder('Item type')
        .addOptions(ITEM_TYPE_CHOICES.map(c => ({ label: c.name, value: c.value })));

    return {
        content: 'What type of item is this?',
        embeds: [],
        components: [
            new ActionRowBuilder().addComponents(select),
            navRow(questId, 'itemBackToAction', `${characterPageId}|${dashboardMessageId}`),
        ],
    };
}

function renderManualItemSubtypeSelect(questId, characterPageId, dashboardMessageId) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'addItemManualSubtype', `${characterPageId}|${dashboardMessageId}`))
        .setPlaceholder('Item subtype (optional)')
        .addOptions(
            { label: 'None', value: NONE_CHOICE_VALUE },
            ...ITEM_SUBTYPE_CHOICES.map(c => ({ label: c.name, value: c.value })),
        );

    return {
        content: 'Does it have a subtype?',
        embeds: [],
        components: [
            new ActionRowBuilder().addComponents(select),
            navRow(questId, 'itemBackToAction', `${characterPageId}|${dashboardMessageId}`),
        ],
    };
}

function renderManualItemRaritySelect(questId, characterPageId, dashboardMessageId) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'addItemManualRarity', `${characterPageId}|${dashboardMessageId}`))
        .setPlaceholder('Rarity (optional)')
        .addOptions(
            { label: 'None', value: NONE_CHOICE_VALUE },
            ...ITEM_RARITY_CHOICES.map(c => ({ label: c.name, value: c.value })),
        );

    return {
        content: 'What rarity is it?',
        embeds: [],
        components: [
            new ActionRowBuilder().addComponents(select),
            navRow(questId, 'itemBackToAction', `${characterPageId}|${dashboardMessageId}`),
        ],
    };
}

async function finalizeManualItemLine(interaction, questId, characterPageId, dashboardMessageId, pending) {
    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        clearPendingManualItem(interaction.user.id);
        return interaction.editReply({ content: err.message, embeds: [], components: [] });
    }

    const character = state.roster.find(c => c.characterPageId === characterPageId);
    if (!character) {
        clearPendingManualItem(interaction.user.id);
        return interaction.editReply({ content: '❌ That character is no longer on this quest\'s roster.', embeds: [], components: [] });
    }

    try {
        questDrafts.addOrReplaceLine(questId, {
            characterPageId: character.characterPageId,
            characterName: character.characterName,
            discordId: character.discordId,
            type: 'item',
            payload: {
                itemName: pending.itemName,
                type: pending.type ?? null,
                subtype: pending.subtype ?? null,
                rarity: pending.rarity ?? null,
                itemValue: pending.itemValue,
                source: pending.sourceTag === 'catalogue' ? 'Dashboard (catalogue)' : 'Dashboard (manual entry)',
                notes: pending.itemNotes || null,
            },
        });
    } catch (err) {
        console.error(`[questDashboard] Error saving item line for quest ${questId}:`, err);
        clearPendingManualItem(interaction.user.id);
        return interaction.editReply({
            content: `⚠️ "${pending.itemName}" looked valid, but I couldn't save it right now. Please try again in a moment.`,
            embeds: [], components: [],
        });
    }

    clearPendingManualItem(interaction.user.id);
    await refreshDashboardMessage(interaction, questId, dashboardMessageId);
    return finishAndDelete(interaction, { content: `✅ **${pending.itemName}** added for **${character.characterName}**.` });
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
        setPendingManualItem(interaction.user.id, { questId, characterPageId, dashboardMessageId, sourceTag: 'manual' });
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

    setPendingManualItem(interaction.user.id, {
        questId, characterPageId, dashboardMessageId, sourceTag: 'catalogue',
        type: item.type ?? null,
        subtype: inferSubtype(item) ?? null,
        rarity: item.rarity ?? null,
    });

    const prefill = {
        itemName: item.name,
        itemValue: item.priceGp != null ? String(item.priceGp) : String(defaultPriceFor(item.rarity)),
    };

    return interaction.showModal(buildManualItemModal(questId, characterPageId, dashboardMessageId, 'catalogue', prefill));
}

async function handleAddItemModalSubmit(interaction, questId, extra) {
    await interaction.deferUpdate();

    const [characterPageId, dashboardMessageId, sourceTag] = extra.split('|');

    const pending = getPendingManualItem(interaction.user.id);
    if (!pending || pending.questId !== questId || pending.characterPageId !== characterPageId) {
        return interaction.editReply({
            content: '❌ This item flow expired or was interrupted — please reopen Add Item and try again.',
            embeds: [], components: [],
        });
    }

    const itemName = interaction.fields.getTextInputValue('itemName').trim();
    if (!itemName) {
        clearPendingManualItem(interaction.user.id);
        return interaction.editReply({ content: '❌ Item Name is required.', embeds: [], components: [] });
    }
    const rawValue = interaction.fields.getTextInputValue('itemValue').trim();
    const itemNotes = interaction.fields.getTextInputValue('itemNotes').trim();

    let itemValue = null;
    if (rawValue !== '') {
        itemValue = Number(rawValue);
        if (isNaN(itemValue)) {
            clearPendingManualItem(interaction.user.id);
            return interaction.editReply({ content: `❌ "${rawValue}" isn't a valid number for Value (gp).`, embeds: [], components: [] });
        }
    }

    setPendingManualItem(interaction.user.id, { ...pending, itemName, itemValue, itemNotes });

    if (sourceTag === 'catalogue') {
        const finalPending = { ...pending, itemName, itemValue, itemNotes };
        return finalizeManualItemLine(interaction, questId, characterPageId, dashboardMessageId, finalPending);
    }

    return interaction.editReply(renderManualItemTypeSelect(questId, characterPageId, dashboardMessageId));
}

async function handleAddItemManualTypeSelect(interaction, questId, extra) {
    await interaction.deferUpdate();
    const [characterPageId, dashboardMessageId] = extra.split('|');

    const pending = getPendingManualItem(interaction.user.id);
    if (!pending || pending.questId !== questId || pending.characterPageId !== characterPageId) {
        return interaction.editReply({ content: '❌ This item flow expired — please reopen Add Item and try again.', embeds: [], components: [] });
    }

    setPendingManualItem(interaction.user.id, { ...pending, type: interaction.values[0] });
    return interaction.editReply(renderManualItemSubtypeSelect(questId, characterPageId, dashboardMessageId));
}

async function handleAddItemManualSubtypeSelect(interaction, questId, extra) {
    await interaction.deferUpdate();
    const [characterPageId, dashboardMessageId] = extra.split('|');

    const pending = getPendingManualItem(interaction.user.id);
    if (!pending || pending.questId !== questId || pending.characterPageId !== characterPageId) {
        return interaction.editReply({ content: '❌ This item flow expired — please reopen Add Item and try again.', embeds: [], components: [] });
    }

    const value = interaction.values[0];
    setPendingManualItem(interaction.user.id, { ...pending, subtype: value === NONE_CHOICE_VALUE ? null : value });
    return interaction.editReply(renderManualItemRaritySelect(questId, characterPageId, dashboardMessageId));
}

async function handleAddItemManualRaritySelect(interaction, questId, extra) {
    await interaction.deferUpdate();
    const [characterPageId, dashboardMessageId] = extra.split('|');

    const pending = getPendingManualItem(interaction.user.id);
    if (!pending || pending.questId !== questId || pending.characterPageId !== characterPageId) {
        return interaction.editReply({ content: '❌ This item flow expired — please reopen Add Item and try again.', embeds: [], components: [] });
    }

    const value = interaction.values[0];
    const finalPending = { ...pending, rarity: value === NONE_CHOICE_VALUE ? null : value };
    return finalizeManualItemLine(interaction, questId, characterPageId, dashboardMessageId, finalPending);
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

module.exports = {
    showItemPlayerSelect,
    handleAddItemPlayerSelect,
    handleItemBackToPlayer,
    handleAddItemActionSelect,
    handleItemBackToAction,
    handleAddItemSourceSelect,
    handleAddItemRetrySearch,
    handleAddItemSearchModalSubmit,
    handleAddItemCatalogueSelect,
    handleAddItemModalSubmit,
    handleAddItemManualTypeSelect,
    handleAddItemManualSubtypeSelect,
    handleAddItemManualRaritySelect,
    handleAddItemRemoveSelect,
};
