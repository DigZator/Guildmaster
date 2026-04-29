module.exports = {

    prefix: {

        'confirm_remove_': async (interaction) => {
            const messageId = interaction.customId.replace('confirm_remove_', '');
            const outputChannel = interaction.guild.channels.cache.find(c => c.name === 'the-long-rest');

            if (!outputChannel) return interaction.reply({ content: 'Output channel not found. Contact an admin.', flags: 64 });

            let message;
            try {
                message = await outputChannel.messages.fetch(messageId);
            } catch {
                return interaction.reply({ content: 'Message not found. It may have already been deleted.', flags: 64 });
            }

            const footerText   = message.embeds[0]?.footer?.text || '';
            const authorIdMatch = footerText.match(/AuthorID:\s*(\d{17,19})/);
            const authorId     = authorIdMatch?.[1] ?? null;
            const isAuthor     = authorId === interaction.user.id;
            const isMod        = interaction.member.roles.cache.some(r => r.name === 'Mods');

            if (!isAuthor && !isMod) return interaction.reply({ content: 'You do not have permission to delete this message.', flags: 64 });

            await message.delete();

            if (message.hasThread) {
                try { await message.thread.delete(); } catch (err) { console.log('Could not delete thread:', err); }
            }

            await interaction.reply({ content: 'Message successfully deleted.', flags: 64 });
        },

        'cancel_remove_': async (interaction) => {
            await interaction.update({ content: 'Deletion cancelled.', components: [] });
        },
    }
};