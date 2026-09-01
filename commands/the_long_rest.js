const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { TLR_SUBMISSION_CHANNEL_ID, TLR_CONTROL_CHANNEL_ID, THE_LONG_REST_CHANNEL_ID } = require('../data/channels');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { getConfig, setConfig } = require('../config/tlrDashboardConfig');
const { buildDashboardEmbed, buildDashboardRow } = require('../buttons/theLongRest');
const { buildRemoveConfirmation } = require('../utils/tlrRemoveFlow');
const memorialIndex = require('../utils/memorialIndex');

function getSubmitterIdFromEmbed(embed) {
    const footerText = embed?.footer?.text || '';
    const match = footerText.match(/AuthorID:\s*(\d{17,19})/);
    return match ? match[1] : null;
}

async function handleReindex(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const outputChannel = interaction.guild.channels.cache.get(THE_LONG_REST_CHANNEL_ID);
    if (!outputChannel) {
        return interaction.reply({ content: 'Output channel not found. Contact an admin.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const entries = [];
    let before;
    // Discord caps a single fetch at 100
    for (let page = 0; page < 50; page++) {
        const batch = await outputChannel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (batch.size === 0) break;

        for (const message of batch.values()) {
            const embed = message.embeds?.[0];
            if (!embed) continue;
            const authorId = getSubmitterIdFromEmbed(embed);
            if (!authorId) continue;
            entries.push({
                messageId: message.id,
                authorId,
                characterName: embed.title || 'Unknown Character',
                postedAt: message.createdTimestamp,
            });
        }

        before = batch.last().id;
        if (batch.size < 100) break;
    }

    memorialIndex.replaceAll(entries);
    await interaction.editReply({ content: `✅ Reindexed. Found **${entries.length}** memorial(s) across the channel.` });
}

async function handleSetup(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const existing = getConfig();
    // Try to refresh an existing dashboard message in-place first.
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

            if (interaction.channel.name !== 'tlr-submission') {
                await interaction.reply({
                    content: 'This command can only be used in the `tlr-submission` channel.',
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

            // Modal 1 for character submission
            const modal_1 = new ModalBuilder()
                .setCustomId('characterSubmission_1')
                .setTitle('Character Memorial Submission - 1/2');

            const characterNameInput = new TextInputBuilder()
                .setCustomId('characterName')
                .setLabel("Character Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const speciesInput = new TextInputBuilder()
                .setCustomId('species')
                .setLabel("Species")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const classInput = new TextInputBuilder()
                .setCustomId('class')
                .setLabel("Class/Subclass")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const aliasesInput = new TextInputBuilder()
                .setCustomId('aliases')
                .setLabel("Aliases (optional)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const factionInput = new TextInputBuilder()
                .setCustomId('faction')
                .setLabel("Faction/Affiliation (optional)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal_1.addComponents(
                new ActionRowBuilder().addComponents(characterNameInput),
                new ActionRowBuilder().addComponents(speciesInput),
                new ActionRowBuilder().addComponents(classInput),
                new ActionRowBuilder().addComponents(aliasesInput),
                new ActionRowBuilder().addComponents(factionInput)
            );

            await interaction.showModal(modal_1);
            return;
        }

        if (subcommand === 'remove') {
            const allowedChannel = [TLR_SUBMISSION_CHANNEL_ID, TLR_CONTROL_CHANNEL_ID];
            if (!allowedChannel.includes(interaction.channel.id)) {
                await interaction.reply({
                    content: 'This command can only be used in the `tlr-submission` channel.',
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
