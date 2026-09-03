const { ChannelType, PermissionFlagsBits } = require('discord.js');

const TEXT_WRITE_BITS = [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageMessages,
];

const VOICE_WRITE_BITS = [
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.Stream,
    PermissionFlagsBits.RequestToSpeak,
];

const VOICE_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

function writeBitsFor(channel) {
    return VOICE_TYPES.includes(channel.type) ? VOICE_WRITE_BITS : TEXT_WRITE_BITS;
}

async function lockChannelToReadOnly(channel) {
    const writeBits = writeBitsFor(channel);
    const guild = channel.guild;
    const botMember = guild.members.me;
    const botHighestPosition = botMember?.roles.highest.position ?? 0;

    const botPerms = channel.permissionsFor(botMember);
    if (!botPerms?.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error(`Bot lacks "Manage Permissions" on #${channel.name} (channel/category-level overwrite likely denies it) — skipped.`);
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone.id, Object.fromEntries(
        writeBits.map(bit => [bitName(bit), false])
    ), { reason: 'Channel archived: locked to read-only' });

    const existingOverwrites = [...channel.permissionOverwrites.cache.values()];

    for (const overwrite of existingOverwrites) {
        if (overwrite.id === guild.roles.everyone.id) continue;
        if (!overwrite.allow.has(PermissionFlagsBits.ViewChannel)) continue;

        let targetPosition = null;
        if (overwrite.type === 0) {

            const role = guild.roles.cache.get(overwrite.id);
            targetPosition = role ? role.position : null;
        } else {
            let member = guild.members.cache.get(overwrite.id);
            if (!member) {
                try { member = await guild.members.fetch(overwrite.id); } catch { member = null; }
            }
            targetPosition = member ? member.roles.highest.position : null;
        }

        if (targetPosition === null || targetPosition >= botHighestPosition) {
            console.warn(`[archiveChannel] Skipped locking overwrite ${overwrite.id} in #${channel.name} — outranks or unresolved relative to bot's highest role.`);
            continue;
        }

        try {
            await channel.permissionOverwrites.edit(overwrite.id, Object.fromEntries(
                writeBits.map(bit => [bitName(bit), false])
            ), { reason: 'Channel archived: locked to read-only' });
        } catch (err) {
            console.warn(`[archiveChannel] Failed to lock overwrite ${overwrite.id} in #${channel.name}: ${err.message}`);
        }
    }
}

const BIT_NAME_MAP = new Map(
    Object.entries(PermissionFlagsBits).map(([name, value]) => [value, name])
);

function bitName(bit) {
    const name = BIT_NAME_MAP.get(bit);
    if (!name) throw new Error(`Unknown permission bit: ${bit}`);
    return name;
}

async function archiveSingleChannel(channel, archiveCategory) {
    await lockChannelToReadOnly(channel);
    await channel.setParent(archiveCategory.id, {
        lockPermissions: false,
        reason: 'Channel archived',
    });
}

async function archiveCategoryChannels(category, archiveCategory) {
    const children = [...category.children.cache.values()];
    const moved = [];
    const skipped = [];

    for (const child of children) {
        try {
            await lockChannelToReadOnly(child);
            await child.setParent(archiveCategory.id, {
                lockPermissions: false,
                reason: 'Category archived',
            });
            moved.push(child);
        } catch (err) {
            console.warn(`[archiveChannel] Skipped #${child.name} while archiving category "${category.name}": ${err.message}`);
            skipped.push({ channel: child, reason: err.message });
        }
    }

    if (skipped.length === 0) {
        await category.delete('Category archived — contents moved to archive category');
    } else {
        console.warn(`[archiveChannel] Left category "${category.name}" in place — ${skipped.length} channel(s) could not be archived.`);
    }

    return { moved, skipped };
}

module.exports = {
    lockChannelToReadOnly,
    archiveSingleChannel,
    archiveCategoryChannels,
    TEXT_WRITE_BITS,
    VOICE_WRITE_BITS,
};
