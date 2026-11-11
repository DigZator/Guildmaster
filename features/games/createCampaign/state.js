// Campaigns currently being created, so two admins can't race
const inProgress = new Set();

const pendingPreviews = new Map();
const PREVIEW_TTL_MS = 5 * 60 * 1000;

module.exports = {
    inProgress,
    pendingPreviews,
    PREVIEW_TTL_MS,
};
