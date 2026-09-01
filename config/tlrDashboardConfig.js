const path = require('path');
const { createJsonStore } = require('../utils/jsonStore');

const configStore = createJsonStore(path.join(__dirname, '../data/tlrDashboardConfig.json'), {
    dashboardChannelId: null,
    dashboardMessageId: null,
});

function getConfig() {
    return configStore.load();
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
};
