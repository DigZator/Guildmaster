const { ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js');
const { buildEmbed } = require('../utils/listGamesHelper')
const memorialDrafts = require('../utils/memorialDrafts');

const memorialModButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('memorial_mod_approve') 
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
        .setCustomId('memorial_mod_deny')  
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
);

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        try {
            if (interaction.customId === 'continue_memorial_part2') {
                const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

                const modal_2 = new ModalBuilder()
                    .setCustomId('characterSubmission_2')
                    .setTitle('Character Memorial Submission - 2/2');

                const backstoryInput = new TextInputBuilder()
                    .setCustomId('backstory')
                    .setLabel("Character Backstory")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const deathInput = new TextInputBuilder()
                    .setCustomId('mannerOfDeath')
                    .setLabel("Manner of Death")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const campaignInput = new TextInputBuilder()
                    .setCustomId('campaign')
                    .setLabel("Adventure Name (optional)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const portraitInput = new TextInputBuilder()
                    .setCustomId('portraitURL')
                    .setLabel("Portrait Image URL")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const embedColor = new TextInputBuilder()
                    .setCustomId('embedColor')
                    .setLabel("Embed Color (hex, e.g., #FFFFFF)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal_2.addComponents(
                    new ActionRowBuilder().addComponents(backstoryInput),
                    new ActionRowBuilder().addComponents(deathInput),
                    new ActionRowBuilder().addComponents(campaignInput),
                    new ActionRowBuilder().addComponents(portraitInput),
                    new ActionRowBuilder().addComponents(embedColor)
                );

                await interaction.showModal(modal_2);
            }

            if (interaction.customId.startsWith('confirm_remove_')) {
                require('../buttons/confirmDelete')(interaction, client);
            }

            if (interaction.customId.startsWith('cancel_remove_')) {
                await interaction.update({
                    content: 'Deletion cancelled.',
                    components: []
                });
            }

            if (interaction.customId === "memorial_preview_confirm") {
                await interaction.deferUpdate();
                const storedData = memorialDrafts.get(interaction.user.id);
                if (!storedData) {
                    await interaction.editReply({
                        content: '❌ Session expired. Please start over.',
                        flags: 64
                    });
                    return;
                }

                const outputChannel = interaction.guild.channels.cache.find(
                    channel => channel.name === 'tlr-control'
                );

                if (!outputChannel) {
                    await interaction.editReply({
                        content: '❌ Mod channel not found. Contact an admin.',
                        flags: 64
                    });
                    return;
                }

                await interaction.editReply({
                    content: '✅ Submitted for moderator review.',
                    components: []
                });

                await outputChannel.send({
                    content: `<@&1466921814214316186>New memorial submission from <@${interaction.user.id}>:`,
                    embeds: [storedData.embed],
                    components: [memorialModButtons]
                });
            }

            if (interaction.customId === "memorial_preview_cancel") {
                await interaction.deferUpdate();
                memorialDrafts.delete(interaction.user.id);

                try {
                    await interaction.message.delete();
                } catch (error) {
                    console.log('Could not delete preview message');
                }

                await interaction.editReply({
                    content: '❌ Submission cancelled. You can start over anytime.',
                    flags: 64
                });
            }

            if (interaction.customId === "memorial_mod_approve") {
                await interaction.deferUpdate();
                const modData = interaction.message.embeds[0];
                const outputChannel = interaction.guild.channels.cache.find(
                    channel => channel.name === 'the-long-rest'
                );
                if (!outputChannel) {
                    await interaction.editReply({
                        content: 'Output channel not found. Contact an admin.',
                        flags: 64
                    });
                    return;
                }

                const characterName = modData.title || 'Character';

                const sentMessage = await outputChannel.send({ embeds: [modData] });
                const thread = await sentMessage.startThread({
                    name: `${characterName} Memorial`,
                    autoArchiveDuration: 1440
                });

                await sentMessage.react('🕯️');
                await sentMessage.react('🕊️');
                await sentMessage.react('❤️');

                await thread.send(
                    `🕯️ **In Memory of ${characterName}** 🕊️\n\nShare memories, stories, or pay your respects here.`
                );

                await thread.send(
                    `||If the creator of a character wishes for that character to be revived or reused by other players, they may share the character sheet here. If no character sheet is provided below, please respect the creator's wishes and do not revive or reuse the character.||`
                );

                const submitterMatch = interaction.message.content.match(/<@(\d+)>/);
                if (submitterMatch) {
                    memorialDrafts.delete(submitterMatch[1]);
                }

                await interaction.editReply({
                    content: '✅ Memorial approved and posted to The Long Rest channel.',
                    components: []
                });
            }

            if (interaction.customId === "memorial_mod_deny") {
                await interaction.deferUpdate();
                const submitterMention = interaction.message.content.match(/<@(\d+)>/);
                const submitterId = submitterMention ? submitterMention[1] : null;

                if (submitterId) {
                    memorialDrafts.delete(submitterId);  // Clear the draft
                }

                await interaction.editReply({
                    content: `❌ Memorial denied by <@${interaction.user.id}>.\n\n` +
                             (submitterId ? `The submitter <@${submitterId}> has been notified.` : ''),
                    components: []
                });

                if (submitterId) {
                    try {
                        const submitter = await client.users.fetch(submitterId);
                        await submitter.send(
                            `❌ Your character memorial submission was not approved by the moderators.\n\n` +
                            `If you have questions, please contact a moderator.`
                        );
                    } catch (error) {
                        console.error('Could not DM submitter:', error);
                    }
                }
            }

            if (interaction.customId === "announcement_preview_confirm") {
                await interaction.deferUpdate();
    
                const session = client.announcementSessions.get(interaction.user.id);
                if (!session) {
                    await interaction.editReply({
                        content: '❌ Session expired.',
                        components: []
                    });
                    return;
                }
                
                const outputChannel = interaction.guild.channels.cache.get(session.outputChannelId);
                
                await outputChannel.send({
                    content: session.roleMention || '',
                    embeds: [session.embedAnnounce],
                    allowedMentions: {
                        roles: session.roleMention ? [session.roleMention.match(/\d+/)[0]] : []
                    }
                });
                
                await interaction.editReply({
                    content: `✅ **Posted in <#${outputChannel.id}>!**`,
                    embeds: [],
                    components: []
                });
                
                client.announcementSessions.delete(interaction.user.id);
            }

            if (interaction.customId === "announcement_preview_cancel") {
                await interaction.deferUpdate();

                await interaction.editReply({
                    content: '❌ Announcement cancelled. You can start over anytime.',
                    embeds: [],
                    components: []
                });

                client.announcementSessions.delete(interaction.user.id);
            }

            if (interaction.customId.startsWith('list_games_next_')) {
                const parts = interaction.customId.split('_');
                const page = parseInt(parts[3]) + 1;
                const userId = parts[4];

                const session = client.listGamesSessions?.get(userId);
                if (!session) {
                    await interaction.reply({ content: '❌ Session expired. Run the command again.', ephemeral: true });
                    return;
                }
                const { embed, totalPage } = buildEmbed(session.sorted, page);

                const row =  new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`list_page_prev_${page}_${userId}`)
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId(`list_games_next_${page}_${userId}`)
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages -1)
                );
                await interaction.update({embeds: [embed], components: [row]});
            }

            if (interaction.customId.startsWith('list_games_prev_')) {
                const parts = interaction.customId.split('_');
                const page = parseInt(parts[3]) - 1;
                const userId = parts[4];

                const session = client.listGamesSessions?.get(userId);
                if (!session) {
                    await interaction.reply({ content: '❌ Session expired. Run the command again.', ephemeral: true });
                    return;
                }
                const { embed, totalPage } = buildEmbed(session.sorted, page);

                const row =  new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`list_page_prev_${page}_${userId}`)
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId(`list_games_next_${page}_${userId}`)
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages -1)
                );

                await interaction.update({embeds: [embed], components: [row]});
            }

        } catch (error) {
            console.error('Error handling button:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'There was an error processing your request!',
                    flags: 64
                });
            }
        }
    });
};