const path = require('path');
const { createJsonStore } = require('../utils/jsonStore');

const configStore = createJsonStore(path.join(__dirname, '../data/ticketGuildConfig.json'), {
    categoryId: null,
    hrCategoryId: null,
    logChannelId: null,
    hrLogChannelId: null,
    dashboardChannelId: null,
    dashboardMessageId: null,
});

const CATEGORY_GROUP_KEYS = {
    normal: 'categoryId',
    hr: 'hrCategoryId',
};

const LOG_CHANNEL_GROUP_KEYS = {
    normal: 'logChannelId',
    hr: 'hrLogChannelId',
};

function getConfig() {
    const stored = configStore.load();
    return {
        ...stored,
        categoryId: stored.categoryId || process.env.TICKET_CATEGORY_ID || null,
        hrCategoryId: stored.hrCategoryId || process.env.HR_TICKET_CATEGORY_ID || null,
        logChannelId: stored.logChannelId || process.env.TICKET_LOG_CHANNEL_ID || null,
        hrLogChannelId: stored.hrLogChannelId || process.env.HR_TICKET_LOG_CHANNEL_ID || null,
    };
}

function getCategoryIdForGroup(group) {
    const config = getConfig();
    const key = CATEGORY_GROUP_KEYS[group] || CATEGORY_GROUP_KEYS.normal;
    return config[key] || null;
}

function getLogChannelIdForGroup(group) {
    const config = getConfig();
    const key = LOG_CHANNEL_GROUP_KEYS[group] || LOG_CHANNEL_GROUP_KEYS.normal;
    return config[key] || null;
}

function setConfig(patch) {
    const current = configStore.load();
    const next = { ...current, ...patch };
    configStore.save(next);
    return next;
}

module.exports = {
    getConfig,
    setConfig,
    getCategoryIdForGroup,
    getLogChannelIdForGroup,
    CATEGORY_GROUP_KEYS,
    LOG_CHANNEL_GROUP_KEYS,
};
