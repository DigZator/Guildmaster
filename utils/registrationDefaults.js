const { onCacheRefresh, invalidateCache } = require('./cache');
const { updateGameProperties } = require('./notion');
const { DEFAULT_REGISTRATION_LINE, DEFAULT_REGISTRATION_LINK, LINKED_REGISTRATION_LINE } = require('../data/registrationDefaults');

function init(client) {
    onCacheRefresh(async (previous, current) => {
        let wrote = false;

        for (const game of current) {
            const properties = {};

            if (!game.rline) {
                properties['Registration Line'] = {
                    rich_text: [{ text: { content: DEFAULT_REGISTRATION_LINE } }],
                };
            } else if (
                game.rline === DEFAULT_REGISTRATION_LINE &&
                game.registrationLink &&
                game.registrationLink !== DEFAULT_REGISTRATION_LINK
            ) {
                properties['Registration Line'] = {
                    rich_text: [{ text: { content: LINKED_REGISTRATION_LINE } }],
                };
            }

            if (!game.registrationLink) {
                properties['Registration Link'] = { url: DEFAULT_REGISTRATION_LINK };
            }

            if (Object.keys(properties).length === 0) continue;

            try {
                await updateGameProperties(game.uid, properties);
                wrote = true;
                console.log(`[RegistrationDefaults] Applied defaults to: ${game.title}`);
            } catch (e) {
                console.error(`[RegistrationDefaults] Failed to set defaults for ${game.title}:`, e);
            }
        }

        if (wrote) invalidateCache();
    });
}

module.exports = { init };
