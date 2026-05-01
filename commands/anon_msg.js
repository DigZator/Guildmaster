const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { addMessage, removeMessage, getMessage, getKeys } = require('../utils/anonStore');

const TIMEOUT_MS = 2 * 60 * 1000;

module.exports = async (interaction, client) => {
    if (!isAdminChannel(interaction)) {
        return interaction.reply({ content: '❌ This command can only be used in admin channels.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
        const key        = interaction.options.getString('key');
        const content    = interaction.options.getString('content');
        const channel    = interaction.options.getChannel('channel');

        await interaction.deferReply({ flags: 64 });

        // Check key is unique
        if (getMessage(key)) {
            return interaction.editReply({ content: `❌ Key \`${key}\` already exists.` });
        }

        const previewEmbed = new EmbedBuilder()
            .setDescription(content)
            .setFooter({ text: `Key: ${key} · Channel: #${channel.name}` });

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

        if (!client.anonPending) client.anonPending = new Map();
        client.anonPending.set(key, { content, channelId: channel.id });

        await interaction.editReply({ content: 'Preview:', embeds: [previewEmbed], components: [row] });
    }

    if (sub === 'rmv') {
        const key    = interaction.options.getString('key');
        const record = getMessage(key);

        if (!record) {
            return interaction.reply({ content: `❌ Key \`${key}\` not found.`, flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        let messageContent = '*Could not fetch message content.*';
        try {
            const channel = await client.channels.fetch(record.channelId);
            const message = await channel.messages.fetch(record.messageId);
            messageContent = message.content || message.embeds[0]?.description || '*No content.*';
        } catch { }

        const previewEmbed = new EmbedBuilder()
            .setTitle('Are you sure you want to remove this message?')
            .setDescription(messageContent)
            .setFooter({ text: `Key: ${key}` });

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
        const key    = interaction.options.getString('key');
        const record = getMessage(key);

        if (!record) {
            return interaction.reply({ content: `❌ Key \`${key}\` not found.`, flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        // Fetch current content
        let currentContent = '*Could not fetch message content.*';
        try {
            const channel = await client.channels.fetch(record.channelId);
            const message = await channel.messages.fetch(record.messageId);
            currentContent = message.content || message.embeds[0]?.description || '*No content.*';
        } catch {
            // message may have been deleted
        }

        await interaction.editReply({
            content: `**Current content for \`${key}\`:**\n\`\`\`\n${currentContent}\n\`\`\`\nSend your new message below. You have 2 minutes.`
        });

        // Wait for user's next message
        const filter = m => m.author.id === interaction.user.id;
        try {
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: TIMEOUT_MS, errors: ['time'] });
            const reply     = collected.first();
            let newContent  = reply.content;

            // Strip backticks if user wrapped content
            newContent = newContent.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

            // Edit the original Discord message
            const targetChannel = await client.channels.fetch(record.channelId);
            const targetMessage = await targetChannel.messages.fetch(record.messageId);
            await targetMessage.edit(newContent);

            // Delete user's reply to keep channel clean
            try { await reply.delete(); } catch { /* may lack permissions */ }

            await interaction.editReply({ content: `✅ Message \`${key}\` updated.` });

        } catch {
            await interaction.editReply({ content: '❌ Edit timed out. No changes made.' });
        }
    }
};