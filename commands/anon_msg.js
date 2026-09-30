const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { removeMessage, getMessage } = require('../utils/anonStore');
const {
    MAX_FILES,
    MAX_KEY_LENGTH,
    deleteFiles,
    saveAttachments,
    toAttachments,
    sweepStaleTemp,
    setPending,
    collectContent,
    stripCodeFence,
    validatePayload,
    skippedNote,
    getAllowedMentions,
    isMissingOnDiscord,
    logAnonAction,
    auditWarning,
} = require('../utils/anonHelper');

const TIMEOUT_MS = 5 * 60 * 1000;

const MENTIONS_WARNING = '⚠️ **Mentions are ON** — any @user, @role or @everyone in this message will ping.\n';

const ADD_PROMPT =
    `What content would you like to post? Please provide it in triple backticks. ` +
    `You may also attach up to ${MAX_FILES} files (images, etc.).\n\nYou have 5 minutes.`;

module.exports = async (interaction, client) => {
    if (!isAdminChannel(interaction, 'botChannelAdmin')) {
        return interaction.reply({ content: '❌ This command can only be used by admins in the admin channel.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
        const key        = interaction.options.getString('key');
        const content    = interaction.options.getString('content');
        const channel    = interaction.options.getChannel('channel');
        const multiline  = interaction.options.getBoolean('multiline') ?? false;
        const nativeFile = interaction.options.getAttachment('attachment');
        const mentions   = interaction.options.getBoolean('mentions') ?? false;

        await interaction.deferReply({ flags: 64 });

        if (key && key.length > MAX_KEY_LENGTH) {
            return interaction.editReply({ content: `❌ Keys can be at most ${MAX_KEY_LENGTH} characters (yours is ${key.length}).` });
        }

        sweepStaleTemp().catch(() => {});

        if (key && getMessage(key)) {
            return interaction.editReply({ content: `❌ Key \`${key}\` already exists.` });
        }

        let filePaths = [];
        const notes = [];
        if (nativeFile) {
            const saved = await saveAttachments([nativeFile]);
            filePaths = saved.paths;
            notes.push(...saved.skipped);
        }

        if (!key) {
            const noKeyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`anon_nokey_confirm`)
                    .setLabel(`Proceed without key`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`anon_nokey_cancel`)
                    .setLabel(`Cancel`)
                    .setStyle(ButtonStyle.Secondary)
            );

            setPending(client, `nokey_${interaction.user.id}`, {
                channelId: channel.id,
                multiline,
                mentions,
                content: content ?? null,
                filePaths,
            });

            return interaction.editReply({
                content: `⚠️ No key provided. This means you **won't be able to edit this message** and will have to **delete it manually** if needed.\n${mentions ? MENTIONS_WARNING : ''}\nAre you sure you want to proceed?${skippedNote(notes)}`,
                components: [noKeyRow]
            });
        }

        let finalContent = content ?? '';
        if (multiline || (!finalContent && filePaths.length === 0)) {
            const result = await collectContent(interaction, {
                prompt: ADD_PROMPT,
                timeMs: TIMEOUT_MS,
                existingCount: filePaths.length,
            });
            if (result.error) {
                await deleteFiles(filePaths);
                return interaction.editReply({ content: '❌ Timed out. No message sent.' });
            }
            finalContent = result.content;
            filePaths = [...filePaths, ...result.filePaths];
            notes.push(...result.skipped);
        }

        const problem = validatePayload(finalContent, filePaths);
        if (problem) {
            await deleteFiles(filePaths);
            return interaction.editReply({ content: `${problem}${skippedNote(notes)}`, embeds: [], components: [], files: [], attachments: [] });
        }

        const footer = [`Key: ${key}`, `Channel: #${channel.name}`];
        if (filePaths.length) footer.push(`Attachments: ${filePaths.length}`);
        footer.push(`Mentions: ${mentions ? 'on' : 'off'}`);

        const previewEmbed = new EmbedBuilder()
            .setDescription(finalContent || '*(attachment only)*')
            .setFooter({ text: footer.join(' · ') });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`anon_confirm_${key}`)
                .setLabel('Send')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`anon_cancel_${key}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        );

        setPending(client, key, { content: finalContent, channelId: channel.id, mentions, filePaths });

        await interaction.editReply({
            content: `Preview:${mentions ? `\n${MENTIONS_WARNING}` : ''}${skippedNote(notes)}`,
            embeds: [previewEmbed],
            components: [row],
            files: toAttachments(filePaths),
        });
    }

    if (sub === 'rmv') {
        const key    = interaction.options.getString('key');
        const record = getMessage(key);

        if (!record) {
            return interaction.reply({ content: `❌ Key \`${key}\` not found.`, flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        let messageContent = '*Could not fetch message content.*';
        let attachmentCount = 0;
        try {
            const ch  = await client.channels.fetch(record.channelId);
            const msg = await ch.messages.fetch(record.messageId);
            messageContent = msg.content || msg.embeds[0]?.description || (msg.attachments.size ? '*Attachment only.*' : '*No content.*');
            attachmentCount = msg.attachments.size;
        } catch (err) {
            if (!isMissingOnDiscord(err)) {
                console.error('[anon_msg] Failed to fetch message for removal preview:', err);
                return interaction.editReply({ content: `❌ Couldn't reach the message for \`${key}\`: ${err.message}\nThe entry was kept — try again.` });
            }
            removeMessage(key);
            return interaction.editReply({ content: `⚠️ Message for \`${key}\` was not found on Discord. The entry has been removed.` });
        }

        const previewEmbed = new EmbedBuilder()
            .setTitle('Are you sure you want to remove this message?')
            .setDescription(messageContent)
            .setFooter({ text: `Key: ${key}${attachmentCount ? ` · ${attachmentCount} attachment(s) will also be removed` : ''}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`anon_remove_confirm_${key}`)
                .setLabel('Remove')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`anon_remove_cancel_${key}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({ embeds: [previewEmbed], components: [row] });
    }

    if (sub === 'edit') {
        const key      = interaction.options.getString('key');
        const mentions = interaction.options.getBoolean('mentions') ?? false;
        const record   = getMessage(key);

        if (!record) {
            return interaction.reply({ content: `❌ Key \`${key}\` not found.`, flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        let currentContent = '*Could not fetch message content.*';
        let attachmentNote = '';
        let targetMessage;
        try {
            const channel = await client.channels.fetch(record.channelId);
            targetMessage = await channel.messages.fetch(record.messageId);
            currentContent = targetMessage.content || targetMessage.embeds[0]?.description || '*No content.*';
            attachmentNote = targetMessage.attachments.size
                ? `\n📎 This message has ${targetMessage.attachments.size} attachment(s). Editing only changes the text — attachments stay as they are.`
                : '';
        } catch (err) {
            if (!isMissingOnDiscord(err)) {
                console.error('[anon_msg] Failed to fetch message for edit:', err);
                return interaction.editReply({ content: `❌ Couldn't reach the message for \`${key}\`: ${err.message}\nThe entry was kept — try again.` });
            }
            removeMessage(key);
            return interaction.editReply({ content: `⚠️ Message for \`${key}\` was not found on Discord. The entry has been removed.` });
        }

        const chunks = [];
        for (let i = 0; i < currentContent.length; i += 1800) {
            chunks.push(currentContent.slice(i, i + 1800));
        }

        await interaction.editReply({
            content: `**Current content for \`${key}\`:**${attachmentNote}`
        });

        for (const chunk of chunks) {
            await interaction.followUp({ content: `\`\`\`\n${chunk}\n\`\`\``, flags: 64});
        }

        await interaction.followUp({
            content: `Send your new message below.${mentions ? `\n${MENTIONS_WARNING}` : ''} You have 5 minutes.`,
            flags: 64
        });

        const filter   = m => m.author.id === interaction.user.id;
        const deadline = Date.now() + TIMEOUT_MS;
        let newContent = null;

        while (newContent === null) {
            let reply;
            try {
                const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: Math.max(deadline - Date.now(), 1000), errors: ['time'] });
                reply = collected.first();
            } catch {
                return interaction.editReply({ content: '❌ Edit timed out. No changes made.' });
            }

            const candidate = stripCodeFence(reply.content);
            const problem = validatePayload(candidate, [...targetMessage.attachments.keys()]);
            if (problem) {
                const secondsLeft = Math.max(Math.ceil((deadline - Date.now()) / 1000), 0);
                await interaction.followUp({ content: `${problem}\nSend a corrected version — you have about ${secondsLeft}s left.`, flags: 64 });
                continue;
            }
            newContent = candidate;
        }

        const logged = await logAnonAction(client, {
            action: 'edit',
            user: interaction.user,
            key,
            channelId: record.channelId,
            messageUrl: targetMessage.url,
            before: targetMessage.content,
            content: newContent,
            mentions,
        });

        try {
            await targetMessage.edit({ content: newContent, allowedMentions: getAllowedMentions(mentions) });
        } catch (err) {
            console.error('[anon_msg] Failed to edit anonymous message:', err);
            await logAnonAction(client, {
                action: 'edit_failed',
                user: interaction.user,
                key,
                channelId: record.channelId,
                messageUrl: targetMessage.url,
                note: err.message,
            });
            return interaction.editReply({ content: `❌ Couldn't edit the message: ${err.message}` });
        }

        await interaction.editReply({ content: `✅ Message \`${key}\` updated.${auditWarning(logged)}` });
    }
};
