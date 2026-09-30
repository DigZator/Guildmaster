const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { getRoleMention, sendChunkedText, clearSessionTimeout, restoreSession, isCurrentPreview, SESSION_GONE_MESSAGE, STALE_PREVIEW_MESSAGE } = require('../utils/announcementHelper');
const { invalidateCache } = require('../utils/cache');
const { updateGameProperties } = require('../utils/notion');
const { addToQueue, getQueue } = require('../utils/activationQueue');
const { sessions } = require('../utils/sessionStore');
const { reportError } = require('../utils/errorReporter');
const { QUEST_BOARD_CHANNEL_ID, BOT_DEBUGGING_CHANNEL_ID, GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

module.exports = {

    exact: {

        announce_confirm: async (interaction, client) => {
            try {
                await interaction.deferUpdate();
            } catch (deferError) {
                if (deferError.code === 10062) {
                    console.warn(`[announcement] deferUpdate timed out — ${interaction.customId}`);
                    return;
                }
                throw deferError;
            }

            const session = sessions.get(interaction.user.id);
            if (!session) return interaction.followUp({ content: SESSION_GONE_MESSAGE, flags: 64 });
            if (!isCurrentPreview(session, interaction)) {
                return interaction.editReply({ content: STALE_PREVIEW_MESSAGE, embeds: [], components: [] });
            }

            sessions.delete(interaction.user.id);
            clearSessionTimeout(interaction.user.id);

            const outputChannelId = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : QUEST_BOARD_CHANNEL_ID;
            const outputChannel = interaction.guild.channels.cache.get(outputChannelId);

            if (!outputChannel) {
                restoreSession(interaction.user.id, session);
                return interaction.followUp({ content: '❌ Output channel not found.', flags: 64 });
            }

            const roleMention = getRoleMention(session.game, interaction.guild);
            try {
                await outputChannel.send({
                    content: roleMention || '',
                    embeds: [session.embed],
                    allowedMentions: { roles: roleMention ? [roleMention.match(/\d+/)[0]] : [] }
                });
            } catch (error) {
                restoreSession(interaction.user.id, session);
                await reportError(client, {
                    scope: '[Announcement]',
                    message: 'Failed to post announcement',
                    error,
                    context: { gameUid: session.game.uid, gameTitle: session.game.title, announcedBy: interaction.user.tag }
                });
                return interaction.followUp({
                    content: `❌ Couldn't post the announcement: ${error.message}\nYour preview is still here — fix the problem and try again.`,
                    flags: 64,
                });
            }

            await interaction.editReply({ content: `✅ Posted in <#${outputChannel.id}>!`, embeds: [], components: [] });

            const ctrlChannel = GUILDMASTER_CTRL_CHANNEL_ID ? interaction.guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID) : null;
            if (ctrlChannel) {
                await ctrlChannel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x57f287)
                            .setTitle('📣 Game Announced')
                            .addFields(
                                { name: 'Game',       value: session.game.title,                inline: true },
                                { name: 'Posted in',  value: `<#${outputChannel.id}>`,           inline: true },
                                { name: 'Announced by', value: `<@${interaction.user.id}>`,      inline: true },
                            )
                            .setTimestamp(),
                    ],
                }).catch(e => console.error('[announcement] Failed to post announce log to guildmaster-ctrl:', e));
            }

            if (session.whatsapp) {
                if (ctrlChannel) {
                    try {
                        await sendChunkedText(payload => ctrlChannel.send(payload), session.whatsapp, {
                            prefix: `📋 **WhatsApp copy — ${session.game.title}**\n`,
                        });
                        if (session.game.artURL) {
                            await ctrlChannel.send({ files: [session.game.artURL] });
                        }
                    } catch (e) {
                        console.error('[announcement] Failed to post WhatsApp copy to guildmaster-ctrl:', e);
                        await interaction.followUp({
                            content: '⚠️ Announcement posted, but the WhatsApp copy could not be saved to guildmaster-ctrl. Check the bot logs.',
                            flags: 64,
                        }).catch(() => {});
                    }
                } else {
                    await interaction.followUp({
                        content: '⚠️ Announcement posted, but `GUILDMASTER_CTRL_CHANNEL_ID` is not configured or the channel could not be found — the WhatsApp copy was not saved anywhere.',
                        flags: 64,
                    }).catch(() => {});
                }
            }

            try {
                await updateGameProperties(session.game.uid, { "Show": { checkbox: true } });
            } catch (e) {
                await reportError(client, {
                    scope: '[Announcement]',
                    message: 'Failed to set Show on Notion',
                    error: e,
                    context: { gameUid: session.game.uid, gameTitle: session.game.title, announcedBy: interaction.user.tag }
                });
            }

            const queueData = getQueue();
            let scheduleNote = null;

            if (queueData.autoSchedule) {
                const queueResult = addToQueue(session.game, interaction.user.id);
                if (queueResult === 'custom_form') {
                    scheduleNote = '⚠️ Not added to the activation queue — this game has a custom registration form.';
                } else if (queueResult === false) {
                    scheduleNote = 'ℹ️ Already in the activation queue.';
                } else {
                    scheduleNote = '📅 Added to the activation queue.';

                    if (ctrlChannel) {
                        await ctrlChannel.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0x5865f2)
                                    .setTitle('📅 Game Added to Activation Schedule')
                                    .addFields(
                                        { name: 'Game',    value: session.game.title,           inline: true },
                                        { name: 'Added by', value: `<@${interaction.user.id}>`, inline: true },
                                        { name: 'Trigger', value: 'Auto-schedule on announce',  inline: true },
                                    )
                                    .setTimestamp(),
                            ],
                        }).catch(e => console.error('[announcement] Failed to post schedule log to guildmaster-ctrl:', e));
                    }
                }
            } else {
                scheduleNote = 'ℹ️ Auto-schedule is off — not added to the activation queue.';
            }

            if (scheduleNote) {
                await interaction.followUp({ content: scheduleNote, flags: 64 });
            }
        

            invalidateCache();
        },

        announce_cancel: async (interaction, client) => {
            try {
                await interaction.deferUpdate();
            } catch (deferError) {
                if (deferError.code === 10062) {
                    console.warn(`[announcement] deferUpdate timed out — ${interaction.customId}`);
                    return;
                }
                throw deferError;
            }

            const session = sessions.get(interaction.user.id);
            if (session && !isCurrentPreview(session, interaction)) {
                return interaction.editReply({ content: STALE_PREVIEW_MESSAGE, embeds: [], components: [] });
            }

            clearSessionTimeout(interaction.user.id);
            sessions.delete(interaction.user.id);
            await interaction.editReply({ content: '❌ Announcement cancelled.', embeds: [], components: [] });
        },

        announce_edit: async (interaction, client) => {
            try {
                await interaction.deferUpdate();
            } catch (deferError) {
                if (deferError.code === 10062) {
                    console.warn(`[announcement] deferUpdate timed out — ${interaction.customId}`);
                    return;
                }
                throw deferError;
            }

            const session = sessions.get(interaction.user.id);
            if (!session) return interaction.editReply({ content: '❌ Session expired.', components: [] });
            if (!isCurrentPreview(session, interaction)) {
                return interaction.editReply({ content: STALE_PREVIEW_MESSAGE, embeds: [], components: [] });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('announce_edit_select')
                .setPlaceholder('Select a field to edit')
                .addOptions(
                    { label: 'Title',             value: 'title'            },
                    { label: 'Blurb',             value: 'blurb'            },
                    { label: 'DM',                value: 'dm'               },
                    { label: 'System',            value: 'system'           },
                    { label: 'Date',              value: 'date'             },
                    { label: 'Time',              value: 'time'             },
                    { label: 'Location / Venue',  value: 'location'         },
                    { label: 'Classes Allowed',   value: 'classes'          },
                    { label: 'Species Allowed',   value: 'species'          },
                    { label: 'Level',             value: 'level'            },
                    { label: 'Experience Level',  value: 'experienceLevel'  },
                    { label: 'Content Warnings',  value: 'warnings'         },
                    { label: 'Other Notes',       value: 'notes'            },
                    { label: 'Art Credits',       value: 'artist'           },
                    { label: 'Cover Art',         value: 'artURL'           },
                    { label: 'Registration Link', value: 'registrationLink' },
                    { label: 'Price',             value: 'price'            },
                    { label: 'Register Line',     value: 'rline'            },
                );

            await interaction.editReply({
                content: '**Select a field to edit**',
                embeds: [],
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
        },
    }
};
