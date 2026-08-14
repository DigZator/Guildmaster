const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { addMessage, removeMessage, getMessage, getKeys } = require('../utils/anonStore');
const { downloadAttachment } = require('../utils/downloadAttachment');
const fs   = require('fs');
const path = require('path');
const https = require('https');

const TIMEOUT_MS = 5 * 60 * 1000;

async function getContent(interaction) {
    await interaction.editReply({
        content: 'What content would you like to post? Please provide it in triple backticks.You may also attach an image.\n\nYou have 5 minutes.'
    });

    const filter = m => m.author.id === interaction.user.id;
    try {
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: TIMEOUT_MS, errors: ['time'] });
        const reply     = collected.first();
        let content     = reply.content;

        content = content.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

        const attachment = reply.attachments.first();
        let filePath = null;

        if (attachment) {
            const ext      = path.extname(attachment.name) || '.png';
            filePath       = path.join(__dirname, `../temp/anon_${Date.now()}${ext}`);
            const tempDir  = path.dirname(filePath);
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            await downloadAttachment(attachment.url, filePath);
        }

        return { content, filePath };
    } catch {
        await interaction.editReply({ content: '❌ Timed out. Please run the command again.' });
        return { error : 'Timed out' };
    }
}

module.exports = async (interaction, client) => {
    if (!isAdminChannel(interaction, 'botChannelAdmin')) {
        return interaction.reply({ content: '❌ This command can only be used by admins in the admin channel.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
        const key        = interaction.options.getString('key');
        const content    = interaction.options.getString('content');
        const channel    = interaction.options.getChannel('channel');
        const multiline   = interaction.options.getBoolean('multiline') ?? false;

        await interaction.deferReply({ flags: 64 });

        if (key && getMessage(key)) {
            return interaction.editReply({ content: `❌ Key \`${key}\` already exists.` });
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

            if (!client.anonPending) client.anonPending = new Map();

            client.anonPending.set(`nokey_${interaction.user.id}`, {
                channelId: channel.id,
                multiline,
                content: content ?? null,
                filePath: null,
            });

            return interaction.editReply({
                content: `⚠️ No key provided. This means you **won't be able to edit this message** and will have to **delete it manually** if needed.\n\nAre you sure you want to proceed?`,
                components: [noKeyRow]
            });
        }

        let finalContent = content ?? null;
        let filePath = null;
        if (multiline || !finalContent) {
            const result = await getContent(interaction);
            if (result.error) return interaction.editReply({ content: '❌ Timed out. No message sent.' });
            finalContent = result.content;
            filePath = result.filePath;
        }
        
        const previewEmbed = new EmbedBuilder()
            .setDescription(finalContent)
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
        client.anonPending.set(key, { content: finalContent, channelId: channel.id, filePath: filePath });

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
            const ch  = await client.channels.fetch(record.channelId);
            const msg = await ch.messages.fetch(record.messageId);
            messageContent = msg.content || msg.embeds[0]?.description || '*No content.*';
        } catch {
            removeMessage(key);
            return interaction.editReply({ content: `⚠️ Message for \`${key}\` was not found on Discord. The entry has been removed.` });
        }

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

        let currentContent = '*Could not fetch message content.*';
        let targetMessage;
        try {
            const channel = await client.channels.fetch(record.channelId);
            targetMessage = await channel.messages.fetch(record.messageId);
            currentContent = targetMessage.content || targetMessage.embeds[0]?.description || '*No content.*';
        } catch {
            removeMessage(key);
            return interaction.editReply({ content: `⚠️ Message for \`${key}\` was not found on Discord. The entry has been removed.` });
        }

		const chunks = [];
		for (let i = 0; i < currentContent.length; i += 1800) {
			chunks.push(currentContent.slice(i, i + 1800));
		}

        await interaction.editReply({
            content: `**Current content for \`${key}\`:**`
        });

        for (const chunk of chunks) {
        	await interaction.followUp({ content: `\`\`\`\n${chunk}\n\`\`\``, flags: 64});
        }

        await interaction.followUp({
            content: `Send your new message below. You have 5 minutes.`,
            flags: 64
        });
                    

        const filter = m => m.author.id === interaction.user.id;
        try {
        	console.log('channel:', interaction.channel?.id, '| channelId', interaction.channelId);
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: TIMEOUT_MS, errors: ['time'] });
            const reply     = collected.first();
            let newContent  = reply.content;

            newContent = newContent.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

            await targetMessage.edit(newContent);

            await interaction.editReply({ content: `✅ Message \`${key}\` updated.` });

        } catch {
            await interaction.editReply({ content: '❌ Edit timed out. No changes made.' });
        }
    }
};	
