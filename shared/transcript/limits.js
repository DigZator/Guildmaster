// Sizes and limits shared by the transcript engine.

const MB = 1024 * 1024;

const MEMORY_BATCH_MAX_BYTES = 32 * MB;

const UNKNOWN_SIZE_ESTIMATE = 2 * MB;

const MIN_FREE_DISK_BYTES = 50 * MB;

function uploadLimitBytes(guild) {
    const tier = guild?.premiumTier ?? 0;
    if (tier >= 3) return 95 * MB;
    if (tier === 2) return 48 * MB;
    return 9.5 * MB;
}

module.exports = { MB, MEMORY_BATCH_MAX_BYTES, UNKNOWN_SIZE_ESTIMATE, MIN_FREE_DISK_BYTES, uploadLimitBytes };
