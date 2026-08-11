// Usage: call this once, right after posting/reposting a dashboard message.
//   const message = await interaction.editReply(payload);
//   attachDashboardExpiry(message, questId);
const DASHBOARD_IDLE_MS = 5 * 60 * 1000; // 5 minutes

function attachDashboardExpiry(message, questId) {
    if (!message?.createMessageComponentCollector) return null;

    const collector = message.createMessageComponentCollector({ idle: DASHBOARD_IDLE_MS });

    collector.on('end', async (_collected, reason) => {
        if (reason !== 'idle') return;

        try {
            await message.delete();
        } catch (err) {
            if (err.code !== 10008) {
                console.warn(`[dashboardExpiry] Failed to delete expired dashboard for quest ${questId}:`, err.message);
            }
        }
    });

    return collector;
}

module.exports = { attachDashboardExpiry, DASHBOARD_IDLE_MS };
