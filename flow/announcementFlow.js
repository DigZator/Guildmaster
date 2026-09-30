const { buildWhatsApp, buildAnnouncementEmbed, sendChunkedText, setSessionTimeout, clearSessionTimeout, getPreviewButtons, getPreviewWarnings } = require('../utils/announcementHelper');
const { sessions } = require('../utils/sessionStore');
const { syncAnnouncementFieldToNotion } = require('../utils/announcementNotionSync');
const { invalidateCache } = require('../utils/cache');

async function sendChunkedWhatsApp(channel, whatsapp, embed, prefix = '') {
    return sendChunkedText(channel.send.bind(channel), whatsapp, {
        prefix,
        embed,
        components: [getPreviewButtons()],
    });
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const session = sessions.get(message.author.id);

        if (!session) return;
        if (message.channelId !== session.channelId) return;

        try {
            // The only step that waits for a chat message is a cover-art upload from the Edit menu.
            if (session.step === "awaiting_art") {
                setSessionTimeout(message.author.id);
                if (message.attachments.size === 0) {
                    const reply = await message.reply('❌ Please upload an image.');
                    setTimeout(() => reply.delete().catch(() => {}), 10000);
                    return;
                }

                const attachment = message.attachments.first();
                if (!attachment.contentType?.startsWith('image/')) {
                    const reply = await message.reply('❌ Must be an image file.');
                    setTimeout(() => reply.delete().catch(() => {}), 10000);
                    return;
                }

                session.game.artURL = attachment.url;
                session.step = null;

                session.embed = buildAnnouncementEmbed(session.game, message.guild);
                session.whatsapp = buildWhatsApp(session.game);

                const syncResult = await syncAnnouncementFieldToNotion(session.game, 'artURL', attachment.url);
                if (syncResult.synced) {
                    invalidateCache();
                }

                const prefix = syncResult.synced
                    ? '✅ Cover art updated! Here\'s the new preview:\n'
                    : '✅ Cover art updated in this preview, but ⚠️ I couldn\'t save it to Notion — the two are now out of sync. Try again or use `/edit_game`.\n';

                const previewMessage = await sendChunkedWhatsApp(
                    message.channel,
                    session.whatsapp,
                    session.embed,
                    `${getPreviewWarnings(session.game, session.embed)}${prefix}`
                );

                // This is a brand-new preview message, so older previews' buttons are now outdated.
                session.previewMessageId = previewMessage?.id;
            }

        } catch (error) {
            console.error('Announcement error:', error);
            await message.channel.send(
                `<@${message.author.id}> ❌ Error: ${error.message}`
            );
            clearSessionTimeout(message.author.id);
            sessions.delete(message.author.id);
        }
    });
};
