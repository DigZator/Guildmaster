const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const parseAnnouncement = require('../utils/announcementParser');

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

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!client.announcementSessions) return;

        const session = client.announcementSessions.get(message.author.id);
        if (!session) return;
        if (message.channelId !== session.channelId) return;

        try {
            if (session.step === 'awaiting_message') {
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
                    console.log('Could not delete message')
                }

                await message.channel.send({
                    content: `<@${message.author.id}> ✅ **Step 1 Complete!**\n\n📸 **Step 2/2:** Upload the image.`,
                    allowedMentions: { users: [message.author.id] }
                });
            }

            else if (session.step === 'awaiting_image') {
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

                const imageUrl = attachment.url;
                const outputChannel = message.guild.channels.cache.find(
                    ch => ch.name === 'quest-board'
                    // ch => ch.name === 'test-out'
                );

                if (!outputChannel) {
                    await message.channel.send(
                        `<@${message.author.id}> ❌ Output channel not found.`
                    );
                    client.announcementSessions.delete(message.author.id);
                    return;
                }

                const parsed = parseAnnouncement(session.announcementText);

                const SESSION_TYPE_ROLES = {
                    'In-Person One-Shot': 'In-Person One-Shots',
                    'In-Person Campaign': 'In-Person Campaigns',
                    'Online One-Shot': 'Online One-Shots',
                    'Online Campaign': 'Online Campaigns'
                };

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
                
                const descriptionParts3 = [
                    `**Other Notes:**`,
                ];

                if (parsed.otherNotes?.length) {
                    parsed.otherNotes.forEach(note =>{
                        descriptionParts3.push(`- ${note}`);
                    });
                }

                descriptionParts3.push(``);

                descriptionParts3.push(`**Campaign Link:** ${parsed.campaignLink ?? ``}`);

                embedAnnounce.addFields({
                    name: `\u200B`,
                    value: descriptionParts1.join(`\n`),
                    inline: false
                });

                embedAnnounce.addFields({
                    name: `\u200B`,
                    value: descriptionParts2.join(`\n`),
                    inline: false
                });

                embedAnnounce.addFields({
                    name: `\u200B`,
                    value: descriptionParts3.join(`\n`),
                    inline: false
                });

                const sessionInfo = [
                    `**Session Type:** ${parsed.sessionTypeLabel}`,
                    `**Venue:** ${parsed.venue ?? ``}`,
                    `**Cost:** ${parsed.cost ?? '—'}`,
                    `**Date:** ${parsed.date}`,
                    `**Time:** ${parsed.time}`
                ].filter(Boolean);

                embedAnnounce.addFields({
                    name: '\u200B',
                    value: sessionInfo.join('\n'),
                    inline: false
                });

                embedAnnounce.addFields({
                    name: `\u200B`,
                    value: '**!! Register by clicking the link below !!**\nhttps://adventuringguildmumbai.fillout.com/player-sign-up',
                    inline: false
                });

                embedAnnounce.setFooter({ text: `Art: ${parsed.artCredits}`});

                session.embedAnnounce = embedAnnounce;
                session.roleMention = roleMention;
                session.outputChannelId = outputChannel.id;
                session.step = 'preview_confirmation';

                await message.channel.send({
                    content: `Here’s a preview of your announcement. Please confirm:`,
                    embeds: [embedAnnounce],
                    components: [previewButtons]
                });
            }

        } catch (error) {
            console.error('Announcement error:', error);
            await message.channel.send(
                `<@${message.author.id}> ❌ Error: ${error.message}`
            );
            client.announcementSessions.delete(message.author.id);
        }
    });
};
