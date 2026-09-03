const { ChannelType, EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { setArchiveCategoryId, getArchiveCategoryId } = require('../config/archiveConfig');

module.exports = async (interaction) => {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        await interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
        return;
    }

    const category = interaction.options.getChannel('category', true);

    if (category.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content: '❌ That has to be a category, not a channel.', flags: 64 });
        return;
    }

    const previousId = getArchiveCategoryId();
    setArchiveCategoryId(category.id);

    const embed = new EmbedBuilder()
        .setTitle('📦 Archive category configured')
        .setDescription(`\`/archive\` will now move archived channels into **${category.name}**.`)
        .addFields({ name: 'Category ID', value: category.id })
        .setColor(0x57f287);

    if (previousId && previousId !== category.id) {
        embed.addFields({ name: 'Previous category ID', value: previousId });
    }

    await interaction.reply({ embeds: [embed], flags: 64 });
};
