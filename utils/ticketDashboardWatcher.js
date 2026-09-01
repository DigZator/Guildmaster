const { getConfig, setConfig } = require('../config/ticketGuildConfig');

function init(client) {
    client.once('clientReady', async () => {
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
