const { addMessage, removeMessage, getMessage } = require('../utils/anonStore');
const {
    MAX_FILES,
    deleteFiles,
    clearPending,
    takePending,
    collectContent,
    validatePayload,
    skippedNote,
    buildSendOptions,
    isMissingOnDiscord,
    logAnonAction,
    auditWarning,
} = require('../utils/anonHelper');

const CLEAR_PREVIEW = { embeds: [], components: [], files: [], attachments: [] };
const SESSION_GONE = '❌ This session has expired or was already handled.';

const removing = new Set();

module.exports = {
    exact: {
        'anon_nokey_confirm': async (interaction, client) => {
            await interaction.deferUpdate();
            const pendingKey = `nokey_${interaction.user.id}`;

            const pending = takePending(client, pendingKey);
            if (!pending) {
                return interaction.followUp({ content: SESSION_GONE, flags: 64 });
            }

            try {
                let finalContent = pending.content ?? '';
                const notes = [];

                if (pending.multiline || (!finalContent && pending.filePaths.length === 0)) {
                    const result = await collectContent(interaction, {
                        prompt: `What content would you like to post? Please provide it in triple backticks. You may also attach up to ${MAX_FILES} files (images, etc.).\n\nYou have 2 minutes.`,
                        timeMs: 2 * 60 * 1000,
                        existingCount: pending.filePaths.length,
                    });

                    if (result.error) {
                        return interaction.editReply({ content: '❌ Timed out. No message sent.', ...CLEAR_PREVIEW });
                    }

                    finalContent = result.content;
                    pending.filePaths.push(...result.filePaths);   // tracked so they get cleaned up
                    notes.push(...result.skipped);
                }

                const problem = validatePayload(finalContent, pending.filePaths);
                if (problem) {
                    return interaction.editReply({ content: `${problem}${skippedNote(notes)}`, ...CLEAR_PREVIEW });
                }

                let sent;
                try {
                    const channel = await client.channels.fetch(pending.channelId);
                    sent = await channel.send(buildSendOptions(finalContent, pending.filePaths, pending.mentions));
                } catch (err) {
                    console.error('[anon_msg] Failed to send anonymous message:', err);
                    return interaction.editReply({ content: `❌ Couldn't post the message: ${err.message}`, ...CLEAR_PREVIEW });
                }

                const logged = await logAnonAction(client, {
                    action: 'send',
                    user: interaction.user,
                    channelId: pending.channelId,
                    messageUrl: sent.url,
                    content: finalContent,
                    fileCount: pending.filePaths.length,
                    mentions: pending.mentions,
                });

                await interaction.editReply({ content: `✅ Message sent anonymously.${skippedNote(notes)}${auditWarning(logged)}`, ...CLEAR_PREVIEW });
            } finally {
                await deleteFiles(pending.filePaths);
            }
        },

        'anon_nokey_cancel': async (interaction, client) => {
            await interaction.deferUpdate();
            clearPending(client, `nokey_${interaction.user.id}`);
            await interaction.editReply({ content: '❌ Cancelled.', ...CLEAR_PREVIEW });
        },
    },
    prefix: {

        'anon_confirm_': async (interaction, client) => {
            await interaction.deferUpdate();
            const key = interaction.customId.replace('anon_confirm_', '');

            const pending = takePending(client, key);
            if (!pending) {
                return interaction.followUp({ content: SESSION_GONE, flags: 64 });
            }

            try {
                if (getMessage(key)) {
                    return interaction.editReply({ content: `❌ Key \`${key}\` already exists.`, ...CLEAR_PREVIEW });
                }

                let sent;
                try {
                    const channel = await client.channels.fetch(pending.channelId);
                    sent = await channel.send(buildSendOptions(pending.content, pending.filePaths, pending.mentions));
                } catch (err) {
                    console.error('[anon_msg] Failed to send anonymous message:', err);
                    return interaction.editReply({ content: `❌ Couldn't post the message: ${err.message}`, ...CLEAR_PREVIEW });
                }

                const result = addMessage({ key, channelId: sent.channelId, messageId: sent.id });
                if (result.error) {
                    await sent.delete().catch(() => {});
                    return interaction.editReply({ content: `❌ ${result.error}`, ...CLEAR_PREVIEW });
                }

                const logged = await logAnonAction(client, {
                    action: 'send',
                    user: interaction.user,
                    key,
                    channelId: sent.channelId,
                    messageUrl: sent.url,
                    content: pending.content,
                    fileCount: pending.filePaths.length,
                    mentions: pending.mentions,
                });

                await interaction.editReply({ content: `✅ Message sent and saved as \`${key}\`.${auditWarning(logged)}`, ...CLEAR_PREVIEW });
            } finally {
                await deleteFiles(pending.filePaths);
            }
        },

        'anon_cancel_': async (interaction, client) => {
            await interaction.deferUpdate();
            const key = interaction.customId.replace('anon_cancel_', '');
            clearPending(client, key);
            await interaction.editReply({ content: '❌ Cancelled.', ...CLEAR_PREVIEW });
        },

        'anon_remove_confirm_': async (interaction, client) => {
            await interaction.deferUpdate();
            const key = interaction.customId.replace('anon_remove_confirm_', '');

            if (removing.has(key)) {
                return interaction.followUp({ content: '⏳ This message is already being removed.', flags: 64 });
            }
            const record = getMessage(key);
            if (!record) {
                return interaction.followUp({ content: '❌ Key not found — it may already have been removed.', flags: 64 });
            }

            removing.add(key);
            try {
                let message = null;
                let content = '*(message was already gone from Discord)*';
                try {
                    const channel = await client.channels.fetch(record.channelId);
                    message = await channel.messages.fetch(record.messageId);
                    content = message.content || message.embeds[0]?.description || (message.attachments.size ? '*Attachment only.*' : '*No content.*');
                } catch (err) {
                    if (!isMissingOnDiscord(err)) {
                        console.error('[anon_msg] Failed to fetch message for removal:', err);
                        return interaction.editReply({ content: `❌ Couldn't reach the message: ${err.message}\nThe entry for \`${key}\` was kept — try again.`, ...CLEAR_PREVIEW });
                    }
                }
                const logged = await logAnonAction(client, {
                    action: 'remove',
                    user: interaction.user,
                    key,
                    channelId: record.channelId,
                    messageUrl: message?.url,
                    content,
                    fileCount: message?.attachments.size ?? 0,
                });

                if (message) {
                    try {
                        await message.delete();
                    } catch (err) {
                        if (!isMissingOnDiscord(err)) {
                            console.error('[anon_msg] Failed to delete anonymous message:', err);
                            await logAnonAction(client, {
                                action: 'remove_failed',
                                user: interaction.user,
                                key,
                                channelId: record.channelId,
                                messageUrl: message.url,
                                note: err.message,
                            });
                            return interaction.editReply({ content: `❌ Couldn't delete the message: ${err.message}\nThe entry for \`${key}\` was kept — try again.`, ...CLEAR_PREVIEW });
                        }
                    }
                }

                removeMessage(key);
                await interaction.editReply({ content: `✅ Message \`${key}\` removed.${auditWarning(logged)}`, ...CLEAR_PREVIEW });
            } finally {
                removing.delete(key);
            }
        },

        'anon_remove_cancel_': async (interaction) => {
            await interaction.deferUpdate();
            await interaction.editReply({ content: '❌ Removal cancelled.', ...CLEAR_PREVIEW });
        },

    }
};
