const {
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    ChannelType, 
    PermissionsBitField,
} = require('discord.js');
const { getCategoryIdForGroup, getLogChannelIdForGroup } = require('../config/ticketGuildConfig');
const { HR_ROLE_ID } = require('../utils/isAdminChannel');
const directLineStore = require('../utils/directLineStore');
const { buildTranscriptChunks } = require('../utils/ticketTranscript');
const { encodeId } = require('../interactions/directLineId');

const CHANNEL_PREFIX = 'dc-';

function confirmRow(dlId, action) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(encodeId(dlId, `${action}Yes`)).setLabel('Yes').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(encodeId(dlId, `${action}No`)).setLabel('No').setStyle(ButtonStyle.Secondary),
    );
}

function slugifyUsername(user) {
    return String(user.username || user.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || user.id;
}

function buildChannelName(primaryUser) {
    const base = `${CHANNEL_PREFIX}${slugifyUsername(primaryUser)}`.slice(0, 90);
    const uses = directLineStore.countChannelNameUses(base);
    if (uses === 0) return base;
    return `${base}-${uses + 1}`.slice(0, 100);
}

function isDirectLineChannel(channel) {
    return !!channel && typeof channel.name === 'string' && channel.name.startsWith(CHANNEL_PREFIX);
}

function getOpenDirectLineForChannel(channel) {
    if (!isDirectLineChannel(channel)) return null;
    const record = directLineStore.getDirectLineByChannelId(channel.id);
    if (!record || record.status !== 'open') return null;
    return record;
}

// ─── Create ─────────────────────────────────────────────────────────────────

async function createDirectLine(interaction, targets) {
    if (!HR_ROLE_ID) {
        return interaction.editReply({ content: '❌ `HR_ROLE_ID` is not configured in the environment. Set it up before using this command.' });
    }

    const categoryId = getCategoryIdForGroup('hr');
    if (!categoryId) {
        return interaction.editReply({ content: '❌ No HR ticket category configured. An admin needs to run `/ticket config` first.' });
    }

    const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
    if (!category) {
        return interaction.editReply({ content: '❌ The configured HR category no longer exists. An admin needs to run `/ticket config` again.' });
    }

    const [primary, ...rest] = targets;
    const channelName = buildChannelName(primary);

    const permissionOverwrites = [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
            id: HR_ROLE_ID,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
        },
        ...targets.map(user => ({
            id: user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
        })),
    ];

    const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites,
    });

    const record = await directLineStore.addDirectLine({
        channelId: channel.id,
        channelName,
        targetIds: targets.map(u => u.id),
        createdBy: interaction.user.id,
        createdAt: Date.now(),
    });

    const mentionList = targets.map(u => `<@${u.id}>`).join(', ');
    const embed = new EmbedBuilder()
        .setTitle('📞 Direct Line')
        .setDescription(
            'This is a direct line of communication that has been engaged by the HR team with ' +
            `${mentionList}. This channel is visible only to the HR team and the people listed above. ` +
            'Messages sent here will be stored for future reference.',
        )
        .setColor(0x5865f2)
        .setTimestamp();

    await channel.send({ content: `<@&${HR_ROLE_ID}> ${mentionList}`, embeds: [embed] });

    await interaction.editReply({ content: `✅ Direct line opened: ${channel}` });
    return record;
}

// ─── Attach / Detach ────────────────────────────────────────────────────────

async function attachTargets(interaction, record, targets, remove) {
    const channel = interaction.guild.channels.cache.get(record.channelId)
        || await interaction.guild.channels.fetch(record.channelId).catch(() => null);

    if (!channel) {
        return interaction.editReply({ content: '❌ This direct line\'s channel no longer exists.' });
    }

    const currentIds = new Set(record.targetIds);
    const changed = [];

    for (const user of targets) {
        if (remove) {
            if (!currentIds.has(user.id)) continue;
            await channel.permissionOverwrites.delete(user.id).catch(() => {});
            currentIds.delete(user.id);
            changed.push(user);
        } else {
            if (currentIds.has(user.id)) continue;
            await channel.permissionOverwrites.create(user.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            });
            currentIds.add(user.id);
            changed.push(user);
        }
    }

    const updated = await directLineStore.updateDirectLine(record.id, { targetIds: [...currentIds] });

    if (!changed.length) {
        return interaction.editReply({ content: remove ? 'ℹ️ None of those people were part of this direct line.' : 'ℹ️ Everyone listed already has access to this direct line.' });
    }

    const mentionList = changed.map(u => `<@${u.id}>`).join(', ');
    await channel.send(
        remove
            ? `🚪 ${mentionList} ${changed.length > 1 ? 'have' : 'has'} been removed from this direct line by <@${interaction.user.id}>.`
            : `➕ ${mentionList} ${changed.length > 1 ? 'have' : 'has'} been added to this direct line by <@${interaction.user.id}>.`,
    );

    await interaction.editReply({
        content: remove
            ? `✅ Removed: ${mentionList}`
            : `✅ Added: ${mentionList}`,
    });

    return updated;
}

// ─── File ───────────────────────────────────────────────────────────────────

async function promptFileConfirm(interaction, record) {
    await interaction.reply({
        content: '🗄️ File this direct line? This is **irreversible** — the transcript will be logged and the channel will be deleted. ⚠️ Images/attachments will **not** be preserved in the log.',
        components: [confirmRow(record.id, 'file')],
        flags: 64,
    });
}

async function cancelFile(interaction) {
    await interaction.update({ content: 'Cancelled.', components: [] });
}

async function finalizeFile(interaction, record) {
    const logChannelId = getLogChannelIdForGroup('hr');
    const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
    const channel = interaction.guild.channels.cache.get(record.channelId);

    if (!logChannel) {
        await interaction.editReply({ content: '❌ No HR log channel configured. An admin needs to run `/ticket config` first. Filing aborted.' });
        return null;
    }
    if (!channel) {
        await interaction.editReply({ content: '❌ Direct line channel no longer exists.' });
        return null;
    }

    const header = `Direct Line — ${record.channelName} — opened by <@${record.createdBy}> with ${record.targetIds.map(id => `<@${id}>`).join(', ')}`;
    const chunks = await buildTranscriptChunks(channel, { header });

    let thread = record.logThreadId ? await logChannel.threads.fetch(record.logThreadId).catch(() => null) : null;
    if (!thread) {
        thread = await logChannel.threads.create({
            name: `${record.channelName}`.slice(0, 100),
            reason: `Direct line ${record.id} filed`,
        });
    }

    for (const chunk of chunks) {
        await thread.send(chunk);
    }

    const updated = await directLineStore.updateDirectLine(record.id, {
        status: 'filed',
        filedAt: Date.now(),
        logThreadId: thread.id,
    });

    await channel.delete().catch(err => console.warn('[directLineFlow] Failed to delete filed direct line channel:', err.message));

    return updated;
}

module.exports = {
    CHANNEL_PREFIX,
    isDirectLineChannel,
    getOpenDirectLineForChannel,
    createDirectLine,
    attachTargets,
    promptFileConfirm,
    cancelFile,
    finalizeFile,
};
