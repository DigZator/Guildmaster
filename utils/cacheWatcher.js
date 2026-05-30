const { onCacheRefresh } = require('./cache');
const { isFlagged, addFlaggedUid, getQueue } = require('./activationQueue');

let ctrlChannel = null;

function init(client) {
    const chanName = 'guildmaster-ctrl';
    
    client.once('clientReady', () => {
        ctrlChannel = client.channels.cache.find(ch => ch.name === chanName);
        if (!ctrlChannel) console.warn('[CacheWatcher] Control channel not found.');
    });

    onCacheRefresh(async (previous, current) => {
        if (!ctrlChannel) return;

        const queue = getQueue().queue;
        const queuedUids = queue.map(g => g.uid);
        const lastRun = getQueue().lastActivationRun;

        for (const game of current) {
            const old = previous.find(g => g.uid === game.uid);
            if (!old) continue;
            if (!old.activate && game.activate) {
                const wasQueued = queuedUids.includes(game.uid);
                const wasInLastRun = lastRun.includes(game.uid);
                if (wasQueued || wasInLastRun) continue;
                if (isFlagged(game.uid)) continue;

                addFlaggedUid(game.uid);
                await ctrlChannel.send(
                    `⚑ **Activation Flag:** \`${game.title}\` was activated outside the bot. Was this intentional?`
                );
            }
        }
    });
}

module.exports = { init };
