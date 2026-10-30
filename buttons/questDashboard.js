const { decodeId } = require('../interactions/questDashboardId');
const {
    handleBackToDashboard,
    handleSubmit,
    handleCompleteConfirm,
    handleSubmitCancel,
    handleCancelQuest,
    handleCancelQuestConfirm,
    handleCancelQuestReturn,
} = require('./questDashboard/common');
const {
    handleAddReward,
    handleAddRewardTypeSelect,
    handleAddRewardBulkModalSubmit,
    handleAddRewardBulkNext,
} = require('./questDashboard/rewards');
const {
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
} = require('./questDashboard/items');
const {
    handleEditParty,
    handlePartyActionSelect,
    handlePartyAddUserSelect,
    handlePartyAddConfirm,
    handlePartyAddCancel,
    handlePartyRemoveSelect,
    handlePartyRemoveConfirm,
    handlePartyRemoveCancel,
    handleToggleGroup,
    handlePartyInfo,
    handlePartyInfoPage,
} = require('./questDashboard/party');

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
    if (action === 'addItemManualType')   return handleAddItemManualTypeSelect(interaction, questId, extra);
    if (action === 'addItemManualSubtype') return handleAddItemManualSubtypeSelect(interaction, questId, extra);
    if (action === 'addItemManualRarity') return handleAddItemManualRaritySelect(interaction, questId, extra);
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
