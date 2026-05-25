const { fetchGames } = require('./notion');

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

let cache = [];
let lastFetched = 0;
let isFetching = false;

async function refreshCache() {
    if (isFetching) return;
    isFetching = true;
    try {
        cache = await fetchGames();
        cache.sort((a, b) => b.createdTime - a.createdTime);
        lastFetched = Date.now();
        console.log(`[Cache] Refreshed at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
        console.error('[Cache] Failed to refresh:', err);
    } finally {
        isFetching = false;
    }
}

async function getCachedGames() {
    if (cache.length === 0 || Date.now() - lastFetched > CACHE_TTL) {
        await refreshCache();
    }
    return cache;
}

function invalidateCache() {
    lastFetched = 0;
    console.log('[Cache] Invalidated');
}

setInterval(refreshCache, CACHE_TTL);

module.exports = { getCachedGames, invalidateCache, refreshCache };
