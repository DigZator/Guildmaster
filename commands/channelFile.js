const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const {
    listProtected, addProtected, removeProtected,
    getAlwaysProtectedIds, runGuards,
} = require('../utils/channelFileGuards');
const jobsStore = require('../utils/channelFileJobs');
const { typeLabel } = require('../utils/channelFiler');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

const DENY = { content: '❌ You do not have permission to use this command.', flags: 64 };

// ─── protect ────────────────────────────────────────────────────────────────
async function handleProtect(interaction) {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        await interaction.reply(DENY);
        return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
        const entries = listProtected();
        const lines = entries.map(e => {
            const exists = interaction.guild.channels.cache.has(e.channelId);
            return `• <#${e.channelId}>${exists ? '' : ' *(no longer exists)*'} — added by <@${e.addedBy}> <t:${Math.floor(e.addedAt / 1000)}:R>`;
        });
        await interaction.reply({
            content: [
                '🛡️ **Manually protected channels**',
                lines.length ? lines.join('\n') : '*None yet.*',
                '',
                '-# Only the bot\'s control channel and the destination of a filing are protected automatically. Add any other channel the bot relies on (ticket, direct line, RSS, dashboards, Keep Alive) here yourself.',
            ].join('\n').slice(0, 2000),
            flags: 64,
            allowedMentions: { parse: [] },
        });
        return;
    }

    const channel = interaction.options.getChannel('channel', true);

    if (sub === 'add') {
        const auto = getAlwaysProtectedIds().get(channel.id);
        if (auto) {
            await interaction.reply({ content: `ℹ️ <#${channel.id}> is already protected automatically — ${auto}.`, flags: 64 });
            return;
        }
        const result = addProtected(channel.id, interaction.user.id);
        await interaction.reply({
            content: result.error ? `❌ ${result.error}` : `✅ <#${channel.id}> is now protected from \`/channel_file\`.`,
            flags: 64,
        });
        return;
    }

    if (sub === 'remove') {
        const result = removeProtected(channel.id);
        await interaction.reply({
            content: result.error ? `❌ ${result.error}` : `✅ <#${channel.id}> is no longer on the manual protect list.`,
            flags: 64,
        });
    }
}

// ─── file ───────────────────────────────────────────────────────────────────
async function handleFile(interaction, client) {
    if (!isAdminChannel(interaction, 'cmd')) {
        await interaction.reply(DENY);
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const target = await client.channels.fetch(interaction.options.getChannel('target', true).id);
    const location = await client.channels.fetch(interaction.options.getChannel('location', true).id);
    const isPrivate = interaction.options.getBoolean('private', true);

    const { blocking, warnings } = await runGuards({ guild: interaction.guild, target, location, isPrivate });
    if (!GUILDMASTER_CTRL_CHANNEL_ID) blocking.push('The control channel (GUILDMASTER_CTRL_CHANNEL_ID) is not configured.');
    if (jobsStore.getRunningJob()) blocking.push('Another filing is running right now. Wait for it to reach review, then try again.');

    if (blocking.length) {
        await interaction.editReply({
            content: `❌ **Cannot file #${target.name}**\n${blocking.map(line => `• ${line}`).join('\n')}`.slice(0, 2000),
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('🗄️ Confirm channel filing')
        .setColor(warnings.length ? 0xFEE75C : 0x5865F2)
        .setDescription([
            `**Target:** <#${target.id}> (${typeLabel(target.type)})`,
            `**Filed into:** <#${location.id}> as a **${isPrivate ? 'private' : 'public'}** thread`,
            '',
            warnings.length ? `**Warnings**\n${warnings.map(w => `⚠️ ${w}`).join('\n')}\n` : null,
            '🧊 Confirming makes the channel **read-only** until you decide. Nothing is deleted until you review the filed copy and press **Proceed**.',
        ].filter(line => line !== null).join('\n').slice(0, 4000));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`channelFile:confirm:${target.id}:${location.id}:${isPrivate ? 'p' : 'u'}`)
            .setLabel(warnings.length ? 'Confirm (I have read the warnings)' : 'Confirm')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('channelFile:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
}

// ─── Entry point ────────────────────────────────────────────────────────────
module.exports = async (interaction, client) => {
    if (interaction.options.getSubcommandGroup(false) === 'protect') {
        return handleProtect(interaction);
    }
    return handleFile(interaction, client);
};

module.exports.handleProtect = handleProtect;
