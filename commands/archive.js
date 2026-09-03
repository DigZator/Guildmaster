const { EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');
const { getArchiveCategoryId } = require('../config/archiveConfig');
const { archiveSingleChannel, archiveCategoryChannels } = require('../utils/archiveChannel');

const MAX_CHANNELS_PER_CATEGORY = 50;

async function postLog(guild, { actor, targetName, targetType, channelCount }) {
    if (!GUILDMASTER_CTRL_CHANNEL_ID) return;
    const logChannel = guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📦 Channel Archived')
        .setColor(0x99aab5)
        .addFields(
            { name: 'Archived by', value: `<@${actor.id}>`, inline: true },
            { name: 'Target', value: `${targetName} (${targetType})`, inline: true },
            { name: 'Channels affected', value: String(channelCount), inline: true },
        )
        .setTimestamp();

    try {
        await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.warn('[archive] Could not post to GUILDMASTER_CTRL_CHANNEL_ID:', err.message);
    }
}

module.exports = async (interaction) => {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        await interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
        return;
    }

    const ARCHIVE_CATEGORY_ID = getArchiveCategoryId();

    if (!ARCHIVE_CATEGORY_ID) {
        await interaction.reply({ content: '❌ No archive category is configured yet. Run `/archive-config` and pick a category first.', flags: 64 });
        return;
    }

    const guild = interaction.guild;
    const archiveCategory = guild.channels.cache.get(ARCHIVE_CATEGORY_ID);

    if (!archiveCategory || archiveCategory.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content: '❌ The configured archive category no longer exists or isn\'t a category anymore. Run `/archive-config` to fix it.', flags: 64 });
        return;
    }

    const target = interaction.options.getChannel('target', true);

    // Can't  archive the archive category itself.
    if (target.id === archiveCategory.id) {
        await interaction.reply({ content: `❌ That is the configured archive category (**${archiveCategory.name}**) — it can't be archived.`, flags: 64 });
        return;
    }

    // target is already inside the archive category.
    if (target.parentId === archiveCategory.id) {
        await interaction.reply({ content: `❌ **${target.name}** is already archived.`, flags: 64 });
        return;
    }

    const isCategory = target.type === ChannelType.GuildCategory;

    if (isCategory) {
        const childCount = target.children.cache.size;
        const currentArchiveCount = archiveCategory.children.cache.size;

        if (childCount === 0) {
            await interaction.reply({ content: `❌ **${target.name}** has no channels in it — nothing to archive. You can delete the empty category manually if you'd like.`, flags: 64 });
            return;
        }

        if (currentArchiveCount + childCount > MAX_CHANNELS_PER_CATEGORY) {
            await interaction.reply({
                content: `❌ Can't archive **${target.name}**: it has ${childCount} channel(s), but **${archiveCategory.name}** already has ${currentArchiveCount}/${MAX_CHANNELS_PER_CATEGORY} channels. Discord caps categories at ${MAX_CHANNELS_PER_CATEGORY} channels.`,
                flags: 64,
            });
            return;
        }
    } else {
        const currentArchiveCount = archiveCategory.children.cache.size;
        if (currentArchiveCount + 1 > MAX_CHANNELS_PER_CATEGORY) {
            await interaction.reply({ content: `❌ Can't archive **${target.name}**: **${archiveCategory.name}** is already at the ${MAX_CHANNELS_PER_CATEGORY}-channel cap.`, flags: 64 });
            return;
        }
    }

    // ── Confirmation step ────────────────────────────────────────────────
    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`archive_confirm_${target.id}`)
            .setLabel(isCategory ? 'Archive category' : 'Archive channel')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('archive_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );

    const description = isCategory
        ? `This will lock every channel in **${target.name}** to read-only, move them into **${archiveCategory.name}**, and delete the now-empty **${target.name}** category.`
        : `This will lock **${target.name}** to read-only (existing viewers keep read access, no one can send messages) and move it into **${archiveCategory.name}**.`;

    const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Confirm archive')
        .setDescription(description)
        .setColor(0xed4245);

    await interaction.reply({
        embeds: [confirmEmbed],
        components: [confirmRow],
        flags: 64,
    });
};

module.exports.postLog = postLog;
module.exports.MAX_CHANNELS_PER_CATEGORY = MAX_CHANNELS_PER_CATEGORY;
