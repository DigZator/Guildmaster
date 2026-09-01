const { ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const {
    loadTicketTypes,
    addTicketType,
    updateTicketType,
    removeTicketType,
    VALID_CATEGORY_GROUPS,
} = require('../config/ticketTypes');
const { getConfig, setConfig } = require('../config/ticketGuildConfig');
const { ticketCreateCustomId } = require('../buttons/ticket');
const ticketStore = require('../utils/ticketStore');

function buildDashboardEmbed() {
    return new EmbedBuilder()
        .setTitle('🎫 Support Tickets')
        .setDescription('Click a button below to open a ticket. A private channel will be created for you.')
        .setColor(0x5865f2);
}

function buildDashboardRow() {
    const buttons = loadTicketTypes().map(type =>
        new ButtonBuilder()
            .setCustomId(ticketCreateCustomId(type.key))
            .setLabel(type.label)
            .setEmoji(type.buttonEmoji)
            .setStyle(ButtonStyle.Primary),
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
    }
    return rows;
}

async function refreshDashboard(guild) {
    const existing = getConfig();
    if (!existing.dashboardChannelId || !existing.dashboardMessageId) return false;

    try {
        const channel = await guild.channels.fetch(existing.dashboardChannelId);
        const message = await channel.messages.fetch(existing.dashboardMessageId);
        await message.edit({ embeds: [buildDashboardEmbed()], components: buildDashboardRow() });
        return true;
    } catch (err) {
        console.warn('[ticket] Could not auto-refresh dashboard after ticket type change:', err.message);
        return false;
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
            await oldMessage.edit({ embeds: [buildDashboardEmbed()], components: buildDashboardRow() });
            await interaction.reply({ content: `✅ Dashboard refreshed in ${oldChannel}.`, flags: 64 });
            return;
        } catch {  }
    }

    const message = await interaction.channel.send({ embeds: [buildDashboardEmbed()], components: buildDashboardRow() });
    setConfig({ dashboardChannelId: interaction.channel.id, dashboardMessageId: message.id });
    await interaction.reply({ content: '✅ Ticket dashboard posted here.', flags: 64 });
}

async function handleConfig(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const category = interaction.options.getChannel('category');
    const hrCategory = interaction.options.getChannel('hr_category');
    const logChannel = interaction.options.getChannel('log_channel');
    const hrLogChannel = interaction.options.getChannel('hr_log_channel');

    if (!category && !hrCategory && !logChannel && !hrLogChannel) {
        const current = getConfig();
        return interaction.reply({
            content: `Current config:\n• Category (normal): ${current.categoryId ? `<#${current.categoryId}>` : '*not set*'}\n• Category (HR): ${current.hrCategoryId ? `<#${current.hrCategoryId}>` : '*not set*'}\n• Log channel (normal): ${current.logChannelId ? `<#${current.logChannelId}>` : '*not set*'}\n• Log channel (HR): ${current.hrLogChannelId ? `<#${current.hrLogChannelId}>` : '*not set*'}`,
            flags: 64,
        });
    }

    const patch = {};
    if (category) patch.categoryId = category.id;
    if (hrCategory) patch.hrCategoryId = hrCategory.id;
    if (logChannel) patch.logChannelId = logChannel.id;
    if (hrLogChannel) patch.hrLogChannelId = hrLogChannel.id;
    setConfig(patch);

    await interaction.reply({ content: '✅ Ticket config updated.', flags: 64 });
}

async function handleResetCounter(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const slug = interaction.options.getString('type');
    if (slug) {
        await ticketStore.resetCounter(slug);
        return interaction.reply({ content: `✅ Counter for \`${slug}\` reset to \`000\`.`, flags: 64 });
    }

    await ticketStore.resetAllCounters();
    await interaction.reply({ content: '✅ All ticket counters reset to `000`.', flags: 64 });
}

function formatTypeLine(type) {
    return `${type.buttonEmoji || '🎫'} **${type.label}** — key: \`${type.key}\`, slug: \`${type.slug}\`, group: \`${type.categoryGroup}\`` +
        (type.channelTag ? `, tag: \`${type.channelTag}\`` : '') +
        (type.viewerRoleId ? `, viewer role: <@&${type.viewerRoleId}>` : '') +
        (type.pingTargetId ? `, ping target: <@&${type.pingTargetId}>` : '');
}

async function handleTypeList(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const types = loadTicketTypes();
    if (!types.length) {
        return interaction.reply({ content: 'No ticket types configured.', flags: 64 });
    }

    return interaction.reply({ content: types.map(formatTypeLine).join('\n'), flags: 64 });
}

async function handleTypeAdd(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const label = interaction.options.getString('label', true);
    const result = addTicketType({
        key: interaction.options.getString('key') || label,
        label,
        buttonEmoji: interaction.options.getString('emoji') || undefined,
        slug: interaction.options.getString('slug') || undefined,
        channelTag: interaction.options.getString('channel_tag') || undefined,
        modalTitle: interaction.options.getString('modal_title') || undefined,
        categoryGroup: interaction.options.getString('category_group') || 'normal',
        viewerRoleId: interaction.options.getRole('viewer_role')?.id || undefined,
        pingTargetId: interaction.options.getRole('ping_target_role')?.id || undefined,
    });

    if (!result.ok) {
        return interaction.reply({ content: `❌ ${result.error}`, flags: 64 });
    }

    const refreshed = await refreshDashboard(interaction.guild);
    return interaction.reply({
        content: `✅ Ticket type \`${result.type.key}\` added.${refreshed ? ' Dashboard refreshed.' : ' (No dashboard is posted yet — run `/ticket setup` to post one.)'}`,
        flags: 64,
    });
}

async function handleTypeEdit(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const key = interaction.options.getString('key', true);
    const patch = {};
    const label = interaction.options.getString('label');
    const emoji = interaction.options.getString('emoji');
    const slug = interaction.options.getString('slug');
    const channelTag = interaction.options.getString('channel_tag');
    const modalTitle = interaction.options.getString('modal_title');
    const categoryGroup = interaction.options.getString('category_group');
    const viewerRole = interaction.options.getRole('viewer_role');
    const pingTargetRole = interaction.options.getRole('ping_target_role');

    if (label !== null) patch.label = label;
    if (emoji !== null) patch.buttonEmoji = emoji;
    if (slug !== null) patch.slug = slug;
    if (channelTag !== null) patch.channelTag = channelTag;
    if (modalTitle !== null) patch.modalTitle = modalTitle;
    if (categoryGroup !== null) patch.categoryGroup = categoryGroup;
    if (viewerRole !== null) patch.viewerRoleId = viewerRole.id;
    if (pingTargetRole !== null) patch.pingTargetId = pingTargetRole.id;

    if (!Object.keys(patch).length) {
        return interaction.reply({ content: '❌ Provide at least one field to change.', flags: 64 });
    }

    const result = updateTicketType(key, patch);
    if (!result.ok) {
        return interaction.reply({ content: `❌ ${result.error}`, flags: 64 });
    }

    const refreshed = await refreshDashboard(interaction.guild);
    return interaction.reply({
        content: `✅ Ticket type \`${key}\` updated.${refreshed ? ' Dashboard refreshed.' : ''}`,
        flags: 64,
    });
}

async function handleTypeRemove(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: 64 });
    }

    const key = interaction.options.getString('key', true);
    const result = removeTicketType(key);
    if (!result.ok) {
        return interaction.reply({ content: `❌ ${result.error}`, flags: 64 });
    }

    const refreshed = await refreshDashboard(interaction.guild);
    return interaction.reply({
        content: `✅ Ticket type \`${key}\` removed. Existing tickets of this type are unaffected.${refreshed ? ' Dashboard refreshed.' : ''}`,
        flags: 64,
    });
}

module.exports = async function ticket(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'type') {
        if (sub === 'add') return handleTypeAdd(interaction);
        if (sub === 'edit') return handleTypeEdit(interaction);
        if (sub === 'remove') return handleTypeRemove(interaction);
        if (sub === 'list') return handleTypeList(interaction);
    }

    if (sub === 'setup') return handleSetup(interaction);
    if (sub === 'config') return handleConfig(interaction);
    if (sub === 'reset_counter') return handleResetCounter(interaction);

    return interaction.reply({ content: '❌ Unknown subcommand.', flags: 64 });
};

module.exports.buildDashboardEmbed = buildDashboardEmbed;
module.exports.buildDashboardRow = buildDashboardRow;
module.exports.refreshDashboard = refreshDashboard;
