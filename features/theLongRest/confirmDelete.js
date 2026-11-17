const { THE_LONG_REST_CHANNEL_ID } = require('../../data/channels');
const memorialIndex = require('./memorialIndex');
const { isTlrMod } = require('./roles');
const { EPHEMERAL } = require('../../shared/utilities/ephemeral');

module.exports = {

    prefix: {

        'confirm_remove_': async (interaction) => {
            const messageId = interaction.customId.replace('confirm_remove_', '');
            const outputChannel = interaction.guild.channels.cache.get(THE_LONG_REST_CHANNEL_ID);

            if (!outputChannel) return interaction.reply({ content: 'Output channel not found. Contact an admin.', flags: EPHEMERAL });

            let message;
            try {
                message = await outputChannel.messages.fetch(messageId);
            } catch {
                return interaction.reply({ content: 'Message not found. It may have already been deleted.', flags: EPHEMERAL });
            }

            const footerText   = message.embeds[0]?.footer?.text || '';
            const authorIdMatch = footerText.match(/AuthorID:\s*(\d{17,19})/);
            const authorId     = authorIdMatch?.[1] ?? null;
            const isAuthor     = authorId === interaction.user.id;
            const isMod        = isTlrMod(interaction.member);

            if (!isAuthor && !isMod) return interaction.reply({ content: 'You do not have permission to delete this message.', flags: EPHEMERAL });

            await message.delete();
            memorialIndex.removeEntry(messageId);

            if (message.hasThread) {
                try { await message.thread.delete(); } catch (err) { console.log('Could not delete thread:', err); }
            }

            await interaction.reply({ content: 'Message successfully deleted.', flags: EPHEMERAL });
        },

        'cancel_remove_': async (interaction) => {
            await interaction.update({ content: 'Deletion cancelled.', components: [] });
        },
    }
};
