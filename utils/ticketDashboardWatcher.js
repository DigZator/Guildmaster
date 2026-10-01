const { getConfig, setConfig } = require('../config/ticketGuildConfig');
const ticketStore = require('./ticketStore');

function init(client) {
    client.once('clientReady', async () => {
        const recovered = await ticketStore.recoverInterruptedFilings();
        if (recovered) {
            console.warn(`[ticketDashboardWatcher] ${recovered} ticket(s) were mid-filing when the bot stopped and have been set back to closed. Check for a partial log thread before filing again.`);
        }

        const config = getConfig();
        if (!config.dashboardChannelId || !config.dashboardMessageId) {
            return;
        }

        try {
            const channel = await client.channels.fetch(config.dashboardChannelId);
            await channel.messages.fetch(config.dashboardMessageId);
        } catch (err) {
            console.warn(
                `[ticketDashboardWatcher] Stored ticket dashboard message is missing (channel ${config.dashboardChannelId}, message ${config.dashboardMessageId}). ` +
                `An admin needs to run /ticket setup again to repost it.`,
                err.message,
            );
            setConfig({ dashboardMessageId: null });
        }
    });
}

module.exports = { init };
