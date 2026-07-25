const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

async function sendAdminLog(guild, embed) {
    const channel = guild.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
    if (channel) await channel.send({ embeds: [embed] });
    else console.warn('[adminLog] LEAGUE_ADMIN_CHANNEL_ID not found in cache.');
}

module.exports = { sendAdminLog };
