const { EmbedBuilder } = require('discord.js');
const editGameSession = require('../utils/editGameSession');
const { updateGameProperties, rehostImageToNotion, filesPropertyFromUpload } = require('../utils/notion');
const { invalidateCache } = require('../utils/cache');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

const URL_PATTERN = /https?:\/\/[^\s<>]+/i;

async function flashReply(message, text) {
    const reply = await message.reply(text);
    setTimeout(() => reply.delete().catch(() => {}), 10000);
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const session = editGameSession.get(message.author.id);
        if (!session || session.step !== 'awaiting_art') return;
        if (message.channelId !== session.channelId) return;

        const text = message.content.trim();

        if (text.toLowerCase() === 'cancel') {
            editGameSession.remove(message.author.id);
            await message.reply('🚫 Cover art edit cancelled.');
            return;
        }

        const attachment = message.attachments.first();
        let source = null;
        let sourceKind = null;

        if (attachment) {
            if (attachment.contentType && !attachment.contentType.startsWith('image/')) {
                await flashReply(message, '❌ That attachment is not an image. Send an image, a link, or type `cancel`.');
                return;
            }
            source = attachment.url;
            sourceKind = 'attachment';
        } else {
            const match = text.match(URL_PATTERN);
            if (!match) {
                await flashReply(message, '❌ Send an image attachment or a link to one (or type `cancel`).');
                return;
            }
            source = match[0];
            sourceKind = 'link';
        }

        // Claim the session so a second message can't start a parallel upload.
        editGameSession.remove(message.author.id);
        await message.react('⏳').catch(() => {});

        try {
            const nameHint = attachment?.name ?? source;
            const uploaded = await rehostImageToNotion(source, nameHint);
            await updateGameProperties(session.gameId, { [session.notionKey]: filesPropertyFromUpload(uploaded) });
            invalidateCache();

            await message.reactions.removeAll().catch(() => {});
            await message.reply(`✅ **${session.fieldName}** updated for **${session.gameName}** (re-hosted at Notion).`);

            const ctrlChannel = GUILDMASTER_CTRL_CHANNEL_ID ? message.guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID) : null;
            if (ctrlChannel) {
                await ctrlChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xfee75c)
                            .setTitle('✏️ Announcement Field Edited')
                            .addFields(
                                { name: 'Game',      value: session.gameName,               inline: true },
                                { name: 'Field',     value: session.fieldName,              inline: true },
                                { name: 'Edited by', value: `<@${message.author.id}>`,      inline: true },
                                { name: 'Before',    value: session.previousValue ? '_(had cover art)_' : '_(empty)_', inline: false },
                                { name: 'After',     value: `\`${uploaded.filename}\` — from ${sourceKind}`, inline: false },
                            )
                            .setTimestamp(),
                    ],
                }).catch(e => console.error('[editGameArtFlow] Failed to post edit log to guildmaster-ctrl:', e));
            }
        } catch (error) {
            console.error('[editGameArtFlow] Error:', error);
            await message.reactions.removeAll().catch(() => {});
            // Put the session back so the admin can just try another image/link.
            editGameSession.set(message.author.id, session);
            await flashReply(message, `❌ ${error.message} Send another image or link, or type \`cancel\`.`);
        }
    });
};
