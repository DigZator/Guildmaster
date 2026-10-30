const { ChannelType } = require('discord.js');
const { BOT_LOG_CHANNEL_ID } = require('../data/channels');

const KEEP_ALIVE_NOTICE =
    '📌 Want this thread to stay open? Use `/keep_alive` to stop it from being archived due to inactivity. ' +
    'This feature is primarily meant for campaign threads that need to stay permanently active. ' +
    'Misuse of this feature may result in administrative action.';

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
                throw new Error('BOT_LOG_CHANNEL_ID not found in cache — skipping alert.');
            }

            const ownerId = thread.ownerId;
            const creatorMention = ownerId ? `<@${ownerId}>` : 'Unknown';
            const parentMention = thread.parentId ? `<#${thread.parentId}>` : 'Unknown channel';

            await logChannel.send({
            	content:
	                `🧵 **New thread created**\n` +
	                `Thread: <#${thread.id}>\n` +
	                `Type: ${threadTypeLabel(thread.type)}\n` +
	                `Channel: ${parentMention}\n` +
	                `Created by: ${creatorMention}`,
                allowedMentions: { parse : [] },
            });
        } catch (err) {
            console.error('[threadAlertLog] Error sending thread creation alert:', err);
        }

        if (thread.ownerId === client.user?.id) return;
        try {
            await thread.send({
                content: KEEP_ALIVE_NOTICE,
                allowedMentions: { parse: [] },
            });
        } catch (err) {
            console.error('[threadAlertLog] Error sending keep_alive notice:', err.message);
        }
    });
};
