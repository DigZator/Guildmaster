const { pollAllFeeds } = require('../utils/rssFetcher');

const INTERVAL_MS = 1 * 60 * 60 * 1000; // 1 hour

module.exports = (client) => {
    client.once('clientReady', () => {
        pollAllFeeds(client);

        setInterval(() => {
            pollAllFeeds(client);
        }, INTERVAL_MS);
    });
};