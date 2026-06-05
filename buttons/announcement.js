const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getRoleMention, clearSessionTimeout } = require('../utils/announcementHelper');
const { invalidateCache } = require('../utils/cache');
const { updateGameProperties } = require('../utils/notion');
const { addToQueue, getQueue } = require('../utils/activationQueue');

module.exports = {

    exact: {

        announcement_preview_confirm: async (interaction, client) => {
            await interaction.deferUpdate();
            const session = client.announcementSessions.get(interaction.user.id);
            if (!session) return interaction.editReply({ content: '❌ Session expired.', components: [] });

            const outputChannel = interaction.guild.channels.cache.get(session.outputChannelId);
            await outputChannel.send({
                content: session.roleMention || '',
                embeds: [session.embedAnnounce],
                allowedMentions: { roles: session.roleMention ? [session.roleMention.match(/\d+/)[0]] : [] }
            });

            await interaction.editReply({ content: `✅ **Posted in <#${outputChannel.id}>!**`, embeds: [], components: [] });
            client.announcementSessions.delete(interaction.user.id);
        },

        announcement_preview_cancel: async (interaction, client) => {
            await interaction.deferUpdate();
            await interaction.editReply({ content: '❌ Announcement cancelled. You can start over anytime.', embeds: [], components: [] });
            client.announcementSessions.delete(interaction.user.id);
        },

        announce_confirm: async (interaction, client) => {
            await interaction.deferUpdate();
            const session = client.announcementSessions?.get(interaction.user.id);
            if (!session) return interaction.editReply({ content: '❌ Session expired.', components: [] });

            const chanName = process.env.DEV_MODE === 'true' ? 'bot-debugging' : 'quest-board';
            const outputChannel = interaction.guild.channels.cache.find(ch => ch.name === chanName);
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

			if (session.game) {
				try {
					await updateGameProperties(session.game.uid, { "Show": { checkbox: true } });
				} catch (e) {
					console.error('[Announcement] Failed to set Show on Notion:', e);
				}
			}

			if (session.game) {
				const queueData = getQueue();
				if (queueData.autoSchedule) {
					addToQueue(session.game, interaction.user.id);
				}
			}

            invalidateCache();
            clearSessionTimeout(client, interaction.user.id);
            client.announcementSessions.delete(interaction.user.id);
        },

        announce_cancel: async (interaction, client) => {
            await interaction.deferUpdate();
            clearSessionTimeout(client, interaction.user.id);
            client.announcementSessions?.delete(interaction.user.id);
            await interaction.editReply({ content: '❌ Announcement cancelled.', embeds: [], components: [] });
        },

        announce_edit: async (interaction, client) => {
            await interaction.deferUpdate();
            const session = client.announcementSessions?.get(interaction.user.id);
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
