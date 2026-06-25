const { onCacheRefresh } = require('./cache');
const { updateGameProperties } = require('./notion');
const { GUILDMASTER_CTRL_CHANNEL_ID, BOT_DEBUGGING_CHANNEL_ID } = require('../data/channels');

let ctrlChannel = null;

function isExempt(uid) {
    return false;
}

function init(client) {
    const ctrlChannelId = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : GUILDMASTER_CTRL_CHANNEL_ID;

    client.once('clientReady', () => {
        ctrlChannel = client.channels.cache.get(ctrlChannelId);
        if (!ctrlChannel) console.warn('[Deactivator] Control channel not found.');
    });

    onCacheRefresh(async (previous, current) => {
        for (const game of current) {
            const old = previous.find(g => g.uid === game.uid);
            if (!old) continue;
            if (isExempt(game.uid)) continue;

            const justFilled = old.openSeats > 0 && game.openSeats === 0 && game.activate;
            const justFreedUp = old.openSeats === 0 && game.openSeats > 0 && !game.activate;

            if (old.openSeats > game.openSeats) {
            	try {
            		if (ctrlChannel) {
            			await ctrlChannel.send(
            				`🔴  A Seat has been reserved in \`${game.title}\`. **Seats open:** \`${game.openSeats}\``
            			);
            		}
            	} catch (err) {
            		console.error(`[Deactivator] Failed to send seat-reserved notice for "\`${game.title}\`":`, err);
            	}
            }

            if (justFilled) {
                try {
                    await updateGameProperties(game.uid, { "Activate": { checkbox: false } });
                    console.log(`[Deactivator] Deactivated "${game.title}" (seats filled).`);
                } catch (err) {
                    console.error(`[Deactivator] Failed to deactivate "${game.title}":`, err);
                    continue;
                }

                if (ctrlChannel) {
                    await ctrlChannel.send(
                        `🔴 **Seats Filled:** \`${game.title}\` has filled up and was automatically removed from sign-ups.`
                    );
                }
            } else if (justFreedUp) {
                // try {
                //     await updateGameProperties(game.uid, { "Activate": { checkbox: true } });
                //     console.log(`[Deactivator] Reactivated "${game.title}" (seat freed up).`);
                // } catch (err) {
                //     console.error(`[Deactivator] Failed to reactivate "${game.title}":`, err);
                // }
            }
        }
    });
}

module.exports = { init };
