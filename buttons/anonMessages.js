const { addMessage, removeMessage, getMessage } = require('../utils/anonStore');
const { downloadAttachment } = require('../utils/downloadAttachment');
const fs   = require('fs');
const path = require('path');

module.exports = {
    exact: {
        'anon_nokey_confirm': async (interaction, client) => {
            await interaction.deferUpdate();
            const pendingKey = `nokey_${interaction.user.id}`;
            const pending    = client.anonPending?.get(pendingKey);

            if (!pending) {
                return interaction.editReply({ content: '❌ Session expired.', components: [] });
            }

            let finalContent = pending.content;
            let filePath     = null;

            if (pending.multiline || !finalContent) {
                await interaction.editReply({
                    content: 'What content would you like to post? Please provide it in triple backticks.\n\nYou have 2 minutes.',
                    components: []
                });

                const filter = m => m.author.id === interaction.user.id;
                try {
                    const collected  = await interaction.channel.awaitMessages({ filter, max: 1, time: 2 * 60 * 1000, errors: ['time'] });
                    const reply      = collected.first();
                    finalContent     = reply.content.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

                    const attachment = reply.attachments.first();
                    if (attachment) {
                        const ext     = path.extname(attachment.name) || '.png';
                        filePath      = path.join(__dirname, `../temp/anon_${Date.now()}${ext}`);
                        const tempDir = path.dirname(filePath);
                        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                        await downloadAttachment(attachment.url, filePath);
                    }

                    try { await reply.delete(); } catch { }

                } catch {
                    client.anonPending?.delete(pendingKey);
                    return interaction.editReply({ content: '❌ Timed out. No message sent.' });
                }
            }

            const channel  = await client.channels.fetch(pending.channelId);
            const sendOpt  = { content: finalContent || '' };
            if (filePath) sendOpt.files = [filePath];

            await channel.send(sendOpt);

            if (filePath) {
                try { await fs.promises.unlink(filePath); } catch (err) { console.error('Failed to delete temp file:', err); }
            }

            client.anonPending.delete(pendingKey);
            await interaction.editReply({ content: `✅ Message sent anonymously.`, components: [] });
        },
        
        'anon_nokey_cancel': async (interaction, client) => {
            await interaction.deferUpdate();
            client.anonPending?.delete(`nokey_${interaction.user.id}`);
            await interaction.editReply({ content: '❌ Cancelled.', components: [] });
        },
    },
    prefix: {

        'anon_confirm_': async (interaction, client) => {
            await interaction.deferUpdate();
            const key     = interaction.customId.replace('anon_confirm_', '');
            const pending = client.anonPending?.get(key);

            if (!pending) {
                return interaction.editReply({ content: '❌ Session expired.', embeds: [], components: [] });
            }

            const channel = await client.channels.fetch(pending.channelId);

            const sendOpt = { content: pending.content || '' };
            if (pending.filePath) {
                sendOpt.files = [pending.filePath];
            }

            const sent    = await channel.send(sendOpt);

            if (pending.filePath) {
                try { await fs.promises.unlink(pending.filePath); } catch (err) { console.error('Failed to delete temp file:', err); 
                }
            }

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