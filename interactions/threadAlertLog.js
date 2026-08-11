const { ChannelType } = require('discord.js');
const { BOT_LOG_CHANNEL_ID } = require('../data/channels');

function threadTypeLabel(type) {
    switch (type) {
        case ChannelType.PrivateThread:      return 'Private Thread';
        case ChannelType.AnnouncementThread: return 'Announcement Thread';
        case ChannelType.PublicThread:
        default:                             return 'Public Thread';
    }
}

module.exports = (client) => {
    client.on('threadCreate', async (thread, newlyCreated) => {
        if (!newlyCreated) return;

        try {
            const logChannel = thread.guild?.channels.cache.get(BOT_LOG_CHANNEL_ID);
            if (!logChannel) {
                console.warn('[threadAlertLog] BOT_LOG_CHANNEL_ID not found in cache — skipping alert.');
                return;
            }

            const ownerId = thread.ownerId;
            const creatorMention = ownerId ? `<@${ownerId}>` : 'Unknown';
            const parentMention = thread.parentId ? `<#${thread.parentId}>` : 'Unknown channel';

            await logChannel.send(
                `🧵 **New thread created**\n` +
                `Thread: <#${thread.id}>\n` +
                `Type: ${threadTypeLabel(thread.type)}\n` +
                `Channel: ${parentMention}\n` +
                `Created by: ${creatorMention}`
            );
        } catch (err) {
            console.error('[threadAlertLog] Error sending thread creation alert:', err);
        }
    });
};
