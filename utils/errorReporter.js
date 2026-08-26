const { EmbedBuilder } = require('discord.js');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

async function reportError(client, { scope = '', message, error, context = {} } = {}) {
    const prefix = scope ? `${scope} ` : '';
    console.error(`${prefix}${message}:`, error);

    if (!client || !GUILDMASTER_CTRL_CHANNEL_ID) return;

    try {
        const channel = await client.channels.fetch(GUILDMASTER_CTRL_CHANNEL_ID);
        if (!channel) return;

        const contextLines = Object.entries(context)
            .map(([k, v]) => `**${k}:** ${v}`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ ${scope || 'Error'}`.trim())
            .setColor(0xED4245)
            .setDescription(message)
            .setTimestamp();

        if (contextLines) embed.addFields({ name: 'Context', value: contextLines.slice(0, 1024) });
        if (error?.message) embed.addFields({ name: 'Error', value: `\`\`\`${String(error.message).slice(0, 1000)}\`\`\`` });

        await channel.send({ embeds: [embed] });
    } catch (reportingError) {
        console.error('[errorReporter] Failed to post error to log channel:', reportingError.message);
    }
}

module.exports = { reportError };
