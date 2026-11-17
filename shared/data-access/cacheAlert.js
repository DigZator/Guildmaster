const { onCacheRefreshFailure } = require('./cache');
const { reportError } = require('../utilities/errorReporter');

function init(client) {
    onCacheRefreshFailure(async (err) => {
        await reportError(client, {
            scope: '[Cache]',
            message: 'Failed to refresh game cache from Notion — data may be stale until the next successful refresh.',
            error: err,
        });
    });
}

module.exports = { init };
