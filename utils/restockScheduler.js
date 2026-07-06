const { restockCadenceMsFor } = require('./5etoolsCatalogue');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // check hourly; cadence itself is enforced per-item
let ctrlChannel = null;
let intervalHandle = null;

const { runRestockCheck } = require('./shopFloor');

async function runRestockScan() {
    const restocked = runRestockCheck();
    if (restocked.length && ctrlChannel) {
        await ctrlChannel.send(`🔄 **Auto-restocked ${restocked.length} shop item(s):** ${restocked.map(r => r.name).join(', ')}`);
    }
}

function init(client) {
    client.once('clientReady', () => {
        ctrlChannel = client.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID) ?? null;
        intervalHandle = setInterval(() => {
            runRestockScan().catch(err => console.error('[restockScheduler] Scan error:', err));
        }, SCAN_INTERVAL_MS);
        // Also run once shortly after startup so items aren't stuck waiting a full hour.
        setTimeout(() => runRestockScan().catch(err => console.error('[restockScheduler] Startup scan error:', err)), 30 * 1000);
        console.log('[restockScheduler] Started.');
    });
}

module.exports = { init, runRestockScan };
