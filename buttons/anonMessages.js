const { addMessage, removeMessage, getMessage } = require('../utils/anonStore');

module.exports = {
    prefix: {

        'anon_confirm_': async (interaction, client) => {
            await interaction.deferUpdate();
            const key     = interaction.customId.replace('anon_confirm_', '');
            const pending = client.anonPending?.get(key);

            if (!pending) {
                return interaction.editReply({ content: '❌ Session expired.', embeds: [], components: [] });
            }

            const channel = await client.channels.fetch(pending.channelId);
            const sent    = await channel.send(pending.content);

            const result = addMessage({ key, channelId: channel.id, messageId: sent.id });
            if (result.error) {
                return interaction.editReply({ content: `❌ ${result.error}`, embeds: [], components: [] });
            }

            client.anonPending.delete(key);
            await interaction.editReply({ content: `✅ Message sent and saved as \`${key}\`.`, embeds: [], components: [] });
        },

        'anon_cancel_': async (interaction, client) => {
            await interaction.deferUpdate();
            const key = interaction.customId.replace('anon_cancel_', '');
            client.anonPending?.delete(key);
            await interaction.editReply({ content: '❌ Cancelled.', embeds: [], components: [] });
        },

        'anon_remove_confirm_': async (interaction, client) => {
            await interaction.deferUpdate();
            const key    = interaction.customId.replace('anon_remove_confirm_', '');
            const record = getMessage(key);

            if (!record) {
                return interaction.editReply({ content: '❌ Key not found.', embeds: [], components: [] });
            }
            try {
                const channel = await client.channels.fetch(record.channelId);
                const message = await channel.messages.fetch(record.messageId);
                await message.delete();
            } catch { }

            removeMessage(key);
            await interaction.editReply({ content: `✅ Message \`${key}\` removed.`, embeds: [], components: [] });
        },

        'anon_remove_cancel_': async (interaction) => {
            await interaction.deferUpdate();
            await interaction.editReply({ content: '❌ Removal cancelled.', embeds: [], components: [] });
        },
    }
};