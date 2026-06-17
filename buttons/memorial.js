const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const memorialDrafts = require('../utils/memorialDrafts');
const { THE_LONG_REST_CHANNEL_ID, TLR_CONTROL_CHANNEL_ID } = require('../data/channels');

const modButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('memorial_mod_approve').setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('memorial_mod_deny').setLabel('Deny').setStyle(ButtonStyle.Danger)
);

module.exports = {

    exact: {

        continue_memorial_part2: async (interaction) => {
            const modal = new ModalBuilder()
                .setCustomId('characterSubmission_2')
                .setTitle('Character Memorial Submission - 2/2');

            const fields = [
                { id: 'backstory',     label: 'Character Backstory',             style: TextInputStyle.Paragraph, required: true  },
                { id: 'mannerOfDeath', label: 'Manner of Death',                 style: TextInputStyle.Paragraph, required: true  },
                { id: 'campaign',      label: 'Adventure Name (optional)',        style: TextInputStyle.Short,     required: false },
                { id: 'portraitURL',   label: 'Portrait Image URL',              style: TextInputStyle.Short,     required: true  },
                { id: 'embedColor',    label: 'Embed Color (hex, e.g. #FFFFFF)', style: TextInputStyle.Short,     required: false },
            ];

            modal.addComponents(fields.map(f =>
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(f.required)
                )
            ));

            await interaction.showModal(modal);
        },

        memorial_preview_confirm: async (interaction) => {
            await interaction.deferUpdate();
            const storedData = memorialDrafts.get(interaction.user.id);
            if (!storedData) return interaction.editReply({ content: '❌ Session expired. Please start over.', flags: 64 });

            const outputChannel = interaction.guild.channels.cache.get(TLR_CONTROL_CHANNEL_ID);
            if (!outputChannel) return interaction.editReply({ content: '❌ Mod channel not found. Contact an admin.', flags: 64 });

            await interaction.editReply({ content: '✅ Submitted for moderator review.', components: [] });
            await outputChannel.send({
                content: `<@&1466921814214316186> New memorial submission from <@${interaction.user.id}>:`,
                embeds: [storedData.embed],
                components: [modButtons]
            });
        },

        memorial_preview_cancel: async (interaction) => {
            await interaction.deferUpdate();
            memorialDrafts.delete(interaction.user.id);
            try { await interaction.message.delete(); } catch { /* already gone */ }
            await interaction.editReply({ content: '❌ Submission cancelled. You can start over anytime.', flags: 64 });
        },

        memorial_mod_approve: async (interaction) => {
            await interaction.deferUpdate();
            const modData = interaction.message.embeds[0];
            const outputChannel = interaction.guild.channels.cache.get(THE_LONG_REST_CHANNEL_ID);
            if (!outputChannel) return interaction.editReply({ content: '❌ Output channel not found. Contact an admin.', flags: 64 });

            const characterName = modData.title || 'Character';
            const sentMessage = await outputChannel.send({ embeds: [modData] });
            const thread = await sentMessage.startThread({ name: `${characterName} Memorial`, autoArchiveDuration: 1440 });

            await sentMessage.react('🕯️');
            await sentMessage.react('🕊️');
            await sentMessage.react('❤️');
            await thread.send(`🕯️ **In Memory of ${characterName}** 🕊️\n\nShare memories, stories, or pay your respects here.`);
            await thread.send(`||If the creator of a character wishes for that character to be revived or reused by other players, they may share the character sheet here. If no character sheet is provided below, please respect the creator's wishes and do not revive or reuse the character.||`);

            const submitterMatch = interaction.message.content.match(/<@(\d+)>/);
            if (submitterMatch) memorialDrafts.delete(submitterMatch[1]);

            await interaction.editReply({ content: '✅ Memorial approved and posted to The Long Rest channel.', components: [] });
        },

        memorial_mod_deny: async (interaction, client) => {
            await interaction.deferUpdate();
            const submitterMatch = interaction.message.content.match(/<@(\d+)>/);
            const submitterId = submitterMatch?.[1] ?? null;
            if (submitterId) memorialDrafts.delete(submitterId);

            await interaction.editReply({
                content: `❌ Memorial denied by <@${interaction.user.id}>.\n\n` +
                         (submitterId ? `The submitter <@${submitterId}> has been notified.` : ''),
                components: []
            });

            if (submitterId) {
                try {
                    const submitter = await client.users.fetch(submitterId);
                    await submitter.send('❌ Your character memorial submission was not approved by the moderators.\n\nIf you have questions, please contact a moderator.');
                } catch (err) {
                    console.error('Could not DM submitter:', err);
                }
            }
        },
    }
};
