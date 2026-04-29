const { pollAllFeeds } = require('../utils/rssFetcher');

const INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

module.exports = (client) => {
    client.once('ready', () => {
        pollAllFeeds(client);

        setInterval(() => {
            pollAllFeeds(client);
        }, INTERVAL_MS);
    });
};