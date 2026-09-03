const { ChannelType } = require('discord.js');
const { getArchiveCategoryId } = require('../config/archiveConfig');
const { archiveSingleChannel, archiveCategoryChannels } = require('../utils/archiveChannel');
const { postLog, MAX_CHANNELS_PER_CATEGORY } = require('../commands/archive');

module.exports = {

    prefix: {

        'archive_confirm_': async (interaction) => {
            const targetId = interaction.customId.replace('archive_confirm_', '');
            const guild = interaction.guild;

            await interaction.update({ content: '⏳ Archiving…', embeds: [], components: [] });

            const archiveCategoryId = getArchiveCategoryId();
            const archiveCategory = archiveCategoryId ? guild.channels.cache.get(archiveCategoryId) : null;
            if (!archiveCategory || archiveCategory.type !== ChannelType.GuildCategory) {
                await interaction.editReply({ content: '❌ The configured archive category is no longer valid. Run `/archive-config` to fix it. Aborted.' });
                return;
            }

            let target;
            try {
                target = await guild.channels.fetch(targetId);
            } catch {
                target = null;
            }

            if (!target) {
                await interaction.editReply({ content: '❌ That channel/category no longer exists. Aborted.' });
                return;
            }

            if (target.parentId === archiveCategory.id) {
                await interaction.editReply({ content: `❌ **${target.name}** is already archived.` });
                return;
            }

            const isCategory = target.type === ChannelType.GuildCategory;

            try {
                if (isCategory) {
                    const childCount = target.children.cache.size;
                    const currentArchiveCount = archiveCategory.children.cache.size;

                    if (childCount === 0) {
                        await interaction.editReply({ content: `❌ **${target.name}** has no channels in it — nothing to archive.` });
                        return;
                    }
                    if (currentArchiveCount + childCount > MAX_CHANNELS_PER_CATEGORY) {
                        await interaction.editReply({ content: `❌ **${archiveCategory.name}** doesn't have room for ${childCount} more channel(s). Aborted, nothing was changed.` });
                        return;
                    }

                    const targetName = target.name;
                    const { moved, skipped } = await archiveCategoryChannels(target, archiveCategory);

                    let content;
                    if (moved.length === 0) {
                        content = `⚠️ Could not archive any channels in **${targetName}** — all ${skipped.length} channel(s) failed (likely a permissions issue). Category left in place. Check the bot logs for details.`;
                    } else if (skipped.length === 0) {
                        content = `✅ Archived category **${targetName}** — moved ${moved.length} channel(s) into **${archiveCategory.name}** and deleted the empty category.`;
                    } else {
                        const skippedNames = skipped.map(s => s.channel.name).join(', ');
                        content = `⚠️ Partially archived **${targetName}** — moved ${moved.length} channel(s), but ${skipped.length} failed and were left behind (${skippedNames}). The **${targetName}** category was kept since it's not empty. Check the bot logs for why those failed (likely a permissions issue).`;
                    }

                    await interaction.editReply({ content });
                    await postLog(guild, {
                        actor: interaction.user,
                        targetName,
                        targetType: 'category',
                        channelCount: moved.length,
                    });
                } else {
                    const currentArchiveCount = archiveCategory.children.cache.size;
                    if (currentArchiveCount + 1 > MAX_CHANNELS_PER_CATEGORY) {
                        await interaction.editReply({ content: `❌ **${archiveCategory.name}** is at the channel cap. Aborted, nothing was changed.` });
                        return;
                    }

                    await archiveSingleChannel(target, archiveCategory);

                    await interaction.editReply({ content: `✅ Archived **${target.name}** — locked to read-only and moved into **${archiveCategory.name}**.` });
                    await postLog(guild, {
                        actor: interaction.user,
                        targetName: target.name,
                        targetType: 'channel',
                        channelCount: 1,
                    });
                }
            } catch (err) {
                console.error('[archive] Failed to archive target:', err);
                await interaction.editReply({ content: `❌ Something went wrong while archiving: ${err.message}` });
            }
        },
    },

    exact: {
        'archive_cancel': async (interaction) => {
            await interaction.update({ content: 'Archive cancelled.', embeds: [], components: [] });
        },
    },
};
