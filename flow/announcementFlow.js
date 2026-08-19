const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const parseAnnouncement = require('../utils/announcementParser');
const { buildWhatsApp, buildAnnouncementEmbed, setSessionTimeout, getPreviewButtons, SESSION_TYPE_ROLES } = require('../utils/announcementHelper');
const { sessions } = require('../utils/sessionStore');
const { QUEST_BOARD_CHANNEL_ID, BOT_DEBUGGING_CHANNEL_ID } = require('../data/channels');
const { syncAnnouncementFieldToNotion } = require('../utils/announcementNotionSync');
const { invalidateCache } = require('../utils/cache');

const previewButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('announcement_preview_confirm')
        .setLabel("Confirm & Post")
        .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
        .setCustomId('announcement_preview_cancel')
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
);

async function sendChunkedWhatsApp(channel, whatsapp, embed, prefix = '') {
    const previewText = `${prefix}\`\`\`\n${whatsapp}\n\`\`\``;

    if (previewText.length <= 2000) {
        await channel.send({
            content: previewText,
            embeds: [embed],
            components: [getPreviewButtons()]
        });
    } else {
        await channel.send({
            content: prefix || null,
            embeds: [embed],
            components: [getPreviewButtons()]
        });

        const chunkSize = 1900;
        const lines = whatsapp.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            if ((currentChunk + '\n' + line).length > chunkSize && currentChunk.length > 0) {
                await channel.send({ content: `\`\`\`\n${currentChunk}\n\`\`\`` });
                currentChunk = line;
            } else {
                currentChunk = currentChunk ? currentChunk + '\n' + line : line;
            }
        }
        if (currentChunk) {
            await channel.send({ content: `\`\`\`\n${currentChunk}\n\`\`\`` });
        }
    }
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        
        const session = sessions.get(message.author.id);

        if (!session) return;
        if (message.channelId !== session.channelId) return;

        try {
            if (session.step === 'awaiting_message') {
                // MANUAL MODE 
                setSessionTimeout(message.author.id, 600000);
                const match = message.content.match(/```([\s\S]*?)```/);

                if (!match) {
                    const reply = await message.reply(
                        '❌ Please wrap your message in triple backticks (``` ```).'
                    );
                    setTimeout(() => reply.delete().catch(() => {}), 10000);
                    return;
                }

                let announcementText = match[1].trim();
                announcementText = announcementText
                    .replace(/\*/g, '**')
                    .replace(/_/g, '*');

                session.announcementText = announcementText;
                session.step = 'awaiting_image';

                try {
                    await message.delete();
                } catch (error) {
                    console.log('Could not delete message');
                }

                await message.channel.send({
                    content: `<@${message.author.id}> ✅ **Step 1 Complete!**\n\n📸 **Step 2/2:** Upload the image.`,
                    allowedMentions: { users: [message.author.id] }
                });
            }

            else if (session.step === 'awaiting_image') {
                setSessionTimeout(message.author.id, 600000);
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

                if (session.announcementText) {
                    // MANUAL MODE: parse freeform text 
                    const imageUrl = attachment.url;

                    const isDev = process.env.DEV_MODE === 'true';
                    const outputChannelId = isDev ? BOT_DEBUGGING_CHANNEL_ID : QUEST_BOARD_CHANNEL_ID;
                    const outputChannel = message.guild.channels.cache.get(outputChannelId);

                    if (!outputChannel) {
                        await message.channel.send(
                            `<@${message.author.id}> ❌ Output channel not found.`
                        );
                        sessions.delete(message.author.id);
                        return;
                    }

                    const parsed = parseAnnouncement(session.announcementText);

                    let roleMention = '';
                    const roleName = SESSION_TYPE_ROLES[parsed.sessionTypeLabel];
                    if (roleName) {
                        const role = message.guild.roles.cache.find(r => r.name === roleName);
                        if (role) roleMention = `<@&${role.id}>`;
                    }

                    const embedAnnounce = new EmbedBuilder()
                        .setTitle(parsed.title)
                        .setImage(imageUrl)
                        .setColor(parsed.embedColor ?? 0x5865F2);

                    const descriptionParts1 = [
                        parsed.format === 'Workshop' ? `**${parsed.sessionTypeLabel}**` :
                        `**${parsed.sessionTypeLabel}** for *${parsed.difficulty ? parsed.difficulty.charAt(0).toUpperCase() + parsed.difficulty.slice(1).toLowerCase() : `N/A`}*`,
                        `**${parsed.date}**`,
                        `**${parsed.time}**`,
                        ``,
                        parsed.blurb];

                    const descriptionParts2 = [
                        `**Content Warnings:** ${parsed.contentWarnings ? parsed.contentWarnings : ""}`,
                        ``,
                        `**DM:** ${parsed.dm ?? `-`}`,
                        `**System:** ${parsed.system ?? `-`}`,
                        `**Level:** ${parsed.level ?? `-`}`,
                        `**Classes Allowed:** ${parsed.classesAllowed ?? `-`}`,
                        `**Species Allowed:** ${parsed.speciesAllowed ?? `-`}`];

                    const descriptionParts3 = [`**Other Notes:**`];
                    if (parsed.otherNotes?.length) {
                        parsed.otherNotes.forEach(note => {
                            descriptionParts3.push(`- ${note}`);
                        });
                    }
                    descriptionParts3.push(``);

                    embedAnnounce.addFields(
                        { name: `\u200B`, value: descriptionParts1.join(`\n`), inline: false },
                        { name: `\u200B`, value: descriptionParts2.join(`\n`), inline: false },
                        { name: `\u200B`, value: descriptionParts3.join(`\n`), inline: false }
                    );

                    const sessionInfo = [
                        `**Session Type:** ${parsed.sessionTypeLabel}`,
                        `**Venue:** ${parsed.venue ?? ``}`,
                        `**Cost:** ${parsed.cost ?? '—'}`,
                        `**Date:** ${parsed.date}`,
                        `**Time:** ${parsed.time}`
                    ].filter(Boolean);

                    embedAnnounce.addFields(
                        { name: '\u200B', value: sessionInfo.join('\n'), inline: false },
                        { name: `\u200B`, value: parsed.registrationText + "\n" + parsed.registrationLink, inline: false }
                    );

                    embedAnnounce.setFooter({ text: `Art: ${parsed.artCredits}` });

                    session.embedAnnounce = embedAnnounce;
                    session.roleMention = roleMention;
                    session.outputChannelId = outputChannel.id;
                    setSessionTimeout(message.author.id, 600000);
                    session.step = 'preview_confirmation';

                    let previewContent = "";
                    if (parsed.hasErrors) {
                        previewContent += `⚠️ **Validation Warnings:**\n`;
                        parsed.errors.forEach(err => {
                            previewContent += `- ${err}\n`;
                        });
                    }
                    previewContent += `\n**Here's a preview of your announcement. Please confirm:**`;

                    await message.channel.send({
                        content: previewContent,
                        embeds: [embedAnnounce],
                        components: [previewButtons]
                    });

                } else {
                    // AUTO MODE: game object already in session
                    session.game.artURL = attachment.url;

                    const embed = buildAnnouncementEmbed(session.game, message.guild);
                    session.embed = embed;
                    setSessionTimeout(message.author.id, 600000);
                    session.step = 'preview_confirmation';

                    await message.channel.send({
                        content: `**Here's a preview of your announcement. Please confirm:**`,
                        embeds: [embed],
                        components: [previewButtons]
                    });
                }
            }

            else if (session.step === "awaiting_art") {
                setSessionTimeout(message.author.id, 600000);
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

                await sendChunkedWhatsApp(
                    message.channel,
                    session.whatsapp,
                    session.embed,
                    prefix
                );
            }

        } catch (error) {
            console.error('Announcement error:', error);
            await message.channel.send(
                `<@${message.author.id}> ❌ Error: ${error.message}`
            );
            sessions.delete(message.author.id);
        }
    });
};
