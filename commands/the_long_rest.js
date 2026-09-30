const { TLR_SUBMISSION_CHANNEL_ID, TLR_CONTROL_CHANNEL_ID, THE_LONG_REST_CHANNEL_ID } = require('../data/channels');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { getConfig, setConfig } = require('../config/tlrDashboardConfig');
const { buildDashboardEmbed, buildDashboardRow, buildSubmissionModal } = require('../buttons/theLongRest');
const { buildRemoveConfirmation } = require('../utils/tlrRemoveFlow');
const { reindexChannel } = require('../utils/memorialReindex');

async function handleReindex(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const outputChannel = interaction.guild.channels.cache.get(THE_LONG_REST_CHANNEL_ID);
    if (!outputChannel) {
        return interaction.reply({ content: 'Output channel not found. Contact an admin.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    try {
        const { count, truncated } = await reindexChannel(outputChannel);
        await interaction.editReply({
            content: `✅ Reindexed. Found **${count}** memorial(s) across the channel.` +
                     (truncated ? '\n⚠️ Scan cap reached — older memorials may be missing.' : '')
        });
    } catch (err) {
        console.error('[the_long_rest] Reindex failed:', err);
        await interaction.editReply({ content: `❌ Reindex failed: ${err.message}\nThe existing index was left unchanged.` });
    }
}

async function handleSetup(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const existing = getConfig();
    if (existing.dashboardChannelId && existing.dashboardMessageId) {
        try {
            const oldChannel = await interaction.guild.channels.fetch(existing.dashboardChannelId);
            const oldMessage = await oldChannel.messages.fetch(existing.dashboardMessageId);
            await oldMessage.edit({ embeds: [buildDashboardEmbed()], components: [buildDashboardRow()] });
            await interaction.reply({ content: `✅ Dashboard refreshed in ${oldChannel}.`, flags: 64 });
            return;
        } catch { /* fall through and post a new one */ }
    }

    const message = await interaction.channel.send({ embeds: [buildDashboardEmbed()], components: [buildDashboardRow()] });
    setConfig({ dashboardChannelId: interaction.channel.id, dashboardMessageId: message.id });
    await interaction.reply({ content: '✅ The Long Rest dashboard posted here.', flags: 64 });
}

module.exports = async (interaction, client) => {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
        return handleSetup(interaction);
    }

    if (subcommand === 'reindex') {
        return handleReindex(interaction);
    }

    try {
        if (subcommand === 'add') {

            if (interaction.channel.id !== TLR_SUBMISSION_CHANNEL_ID) {
                await interaction.reply({
                    content: TLR_SUBMISSION_CHANNEL_ID
                        ? `This command can only be used in <#${TLR_SUBMISSION_CHANNEL_ID}>.`
                        : 'The submission channel is not configured. Contact an admin.',
                    flags: 64
                });
                return;
            }

            const outputChannel = interaction.guild.channels.cache.get(THE_LONG_REST_CHANNEL_ID);

            if (!outputChannel) {
                await interaction.reply({
                    content: 'Output channel not found. Contact an admin.',
                    flags: 64
                });
                return;
            }

            await interaction.showModal(buildSubmissionModal());
            return;
        }

        if (subcommand === 'remove') {
            const allowedChannel = [TLR_SUBMISSION_CHANNEL_ID, TLR_CONTROL_CHANNEL_ID];
            if (!allowedChannel.includes(interaction.channel.id)) {
                await interaction.reply({
                    content: 'This command can only be used in the memorial submission or control channel.',
                    flags: 64
                });
                return;
            }
            await interaction.deferReply({flags: 64});
            const messageId = interaction.options.getString('message_id');

            const { payload } = await buildRemoveConfirmation(interaction, messageId);
            await interaction.editReply(payload);
        }
    } catch (error) {
        console.error('Error handling The Long Rest command:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'There was an error while executing this command!',
                flags: 64
            });
        }
    }
};
