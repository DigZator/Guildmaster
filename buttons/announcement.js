const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { getRoleMention, clearSessionTimeout } = require('../utils/announcementHelper');
const { invalidateCache } = require('../utils/cache');
const { updateGameProperties } = require('../utils/notion');
const { addToQueue, getQueue } = require('../utils/activationQueue');
const { sessions } = require('../utils/sessionStore');
const { reportError } = require('../utils/errorReporter');
const { QUEST_BOARD_CHANNEL_ID, BOT_DEBUGGING_CHANNEL_ID, GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

module.exports = {

    exact: {

        announcement_preview_confirm: async (interaction, client) => {
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

            const outputChannel = interaction.guild.channels.cache.get(session.outputChannelId);
            await outputChannel.send({
                content: session.roleMention || '',
                embeds: [session.embedAnnounce],
                allowedMentions: { roles: session.roleMention ? [session.roleMention.match(/\d+/)[0]] : [] }
            });

            await interaction.editReply({ content: `✅ **Posted in <#${outputChannel.id}>!**`, embeds: [], components: [] });
            sessions.delete(interaction.user.id);
        },

        announcement_preview_cancel: async (interaction, client) => {
            try {
                await interaction.deferUpdate();
            } catch (deferError) {
                if (deferError.code === 10062) {
                    console.warn(`[announcement] deferUpdate timed out — ${interaction.customId}`);
                    return;
                }
                throw deferError;
            }

            await interaction.editReply({ content: '❌ Announcement cancelled. You can start over anytime.', embeds: [], components: [] });
            sessions.delete(interaction.user.id);
        },

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
            if (!session) return interaction.editReply({ content: '❌ Session expired.', components: [] });

            const outputChannelId = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : QUEST_BOARD_CHANNEL_ID;
            const outputChannel = interaction.guild.channels.cache.get(outputChannelId);
            
            if (!outputChannel) return interaction.editReply({ content: '❌ Output channel not found.', components: [] });

            if (!session.game) {
                await outputChannel.send({
                    content: session.roleMention || '',
                    embeds: [session.embedAnnounce],
                    allowedMentions: { roles: session.roleMention ? [session.roleMention.match(/\d+/)[0]] : [] }
                });
            } else {
                const roleMention = getRoleMention(session.game, interaction.guild);
                await outputChannel.send({
                    content: roleMention || '',
                    embeds: [session.embed],
                    allowedMentions: { roles: roleMention ? [roleMention.match(/\d+/)[0]] : [] }
                });
            }

            await interaction.editReply({ content: `✅ Posted in <#${outputChannel.id}>!`, embeds: [], components: [] });

            const ctrlChannel = GUILDMASTER_CTRL_CHANNEL_ID ? interaction.guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID) : null;
            if (ctrlChannel && session.game) {
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

            if (session.game) {
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
            }

            if (session.game) {
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
            }

            invalidateCache();
            clearSessionTimeout(interaction.user.id);
            sessions.delete(interaction.user.id);
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
