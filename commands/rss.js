const { EmbedBuilder } = require('discord.js');
const { getFeeds, addFeed, removeFeed } = require('../utils/rssStore');
const Parser = require('rss-parser');

const parser = new Parser();

const DEFAULT_CHANNEL_NAME = 'feeds';

module.exports = async (interaction, client) => {
    const isMod = interaction.member.roles.cache.some(r => r.name === 'Mods');
    if (!isMod) {
        return interaction.reply({ content: '❌ You do not have permission to manage RSS feeds.', flags: 64 });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
        const url     = interaction.options.getString('url');
        const name    = interaction.options.getString('name');
        const channel = interaction.options.getChannel('channel')
            ?? interaction.guild.channels.cache.find(c => c.name === DEFAULT_CHANNEL_NAME);

        if (!channel) {
            return interaction.reply({ content: `❌ Could not find a #${DEFAULT_CHANNEL_NAME} channel. Please specify one.`, flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });
        try {
            await parser.parseURL(url);
        } catch {
            return interaction.editReply({ content: '❌ Could not parse that URL as an RSS feed. Double check it.' });
        }

        const result = addFeed({ url, name, channelId: channel.id });
        if (result.error) return interaction.editReply({ content: `❌ ${result.error}` });

        return interaction.editReply({ content: `✅ Added **${name}** → <#${channel.id}>` });
    }

    if (sub === 'remove') {
        const query  = interaction.options.getString('query');
        const result = removeFeed(query);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, flags: 64 });
        return interaction.reply({ content: `✅ Removed **${result.removed.name}**.`, flags: 64 });
    }

    if (sub === 'list') {
        const feeds = getFeeds();
        if (!feeds.length) return interaction.reply({ content: 'No RSS feeds configured yet.', flags: 64 });

        const embed = new EmbedBuilder()
            .setTitle('📰 RSS Feeds')
            .setDescription(feeds.map(f =>
                `**${f.name}**\n<#${f.channelId}> · Last: ${f.lastPostTitle ? `*${f.lastPostTitle}*` : 'none yet'}`
            ).join('\n\n'));

        return interaction.reply({ embeds: [embed], flags: 64 });
    }
};