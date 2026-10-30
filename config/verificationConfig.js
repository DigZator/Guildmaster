const path = require('path');
const { createJsonStore } = require('../utils/jsonStore');

const DEFAULTS = {
    dashboardChannelId: null,
    dashboardMessageId: null,
    adventurerRoleId: null,
    logChannelId: null,
    questionTimeLimitMin: 3,
    lockoutMin: 5,
    maxAttempts: 3,
    deadlineDays: 14,
    reminderDays: [7, 3, 1],
    cleanupMode: 'disabled', // 'enabled' | 'dryrun' | 'disabled'
    cleanupEnabledAt: null,  // timestamp of the last disabled-active switch
};

const CLEANUP_MODES = ['enabled', 'dryrun', 'disabled'];

// Min/max bounds for every editable setting (inclusive)
const BOUNDS = {
    questionTimeLimitMin: [1, 30],
    lockoutMin: [1, 1440],
    maxAttempts: [1, 10],
    deadlineDays: [1, 90],
};

const configStore = createJsonStore(path.join(__dirname, '../data/verificationConfig.json'), DEFAULTS);

function getConfig() {
    const stored = configStore.load();
    return {
        ...DEFAULTS,
        ...stored,
        adventurerRoleId: stored.adventurerRoleId || process.env.ADVENTURER_ROLE_ID || null,
        logChannelId: stored.logChannelId || process.env.BOT_LOG_CHANNEL_ID || null,
    };
}

function setConfig(patch) {
    const current = configStore.load();
    const next = { ...DEFAULTS, ...current, ...patch };
    configStore.save(next);
    return next;
}

module.exports = { getConfig, setConfig, DEFAULTS, BOUNDS, CLEANUP_MODES };
