const { ChannelType, PermissionFlagsBits, Routes } = require('discord.js');

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

function writeBitsFor(channel, includeTextBits = false) {
    if (!VOICE_TYPES.includes(channel.type)) return TEXT_WRITE_BITS;
    return includeTextBits ? [...VOICE_WRITE_BITS, ...TEXT_WRITE_BITS] : VOICE_WRITE_BITS;
}

async function lockChannelToReadOnly(channel, { reason = 'Channel archived: locked to read-only', includeTextBits = false } = {}) {
    const writeBits = writeBitsFor(channel, includeTextBits);
    const guild = channel.guild;
    const botMember = guild.members.me;
    const botHighestPosition = botMember?.roles.highest.position ?? 0;

    const botPerms = channel.permissionsFor(botMember);
    if (!botPerms?.has(PermissionFlagsBits.ManageRoles)) {
        throw new Error(`Bot lacks "Manage Permissions" on #${channel.name} (channel/category-level overwrite likely denies it) — skipped.`);
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone.id, Object.fromEntries(
        writeBits.map(bit => [bitName(bit), false])
    ), { reason });

    const skipped = [];

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
            skipped.push({ id: overwrite.id, reason: 'outranks the bot or could not be resolved' });
            continue;
        }

        try {
            await channel.permissionOverwrites.edit(overwrite.id, Object.fromEntries(
                writeBits.map(bit => [bitName(bit), false])
            ), { reason });
        } catch (err) {
            console.warn(`[archiveChannel] Failed to lock overwrite ${overwrite.id} in #${channel.name}: ${err.message}`);
            skipped.push({ id: overwrite.id, reason: err.message });
        }
    }

    return { skipped };
}

const BIT_NAME_MAP = new Map(
    Object.entries(PermissionFlagsBits).map(([name, value]) => [value, name])
);

function bitName(bit) {
    const name = BIT_NAME_MAP.get(bit);
    if (!name) throw new Error(`Unknown permission bit: ${bit}`);
    return name;
}

// ─── Permission snapshot / restore ──────────────────────────────────────────
function snapshotOverwrites(channel) {
    return {
        channelId: channel.id,
        guildId: channel.guild.id,
        takenAt: Date.now(),
        overwrites: [...channel.permissionOverwrites.cache.values()].map(o => ({
            id: o.id,
            type: o.type,
            allow: o.allow.bitfield.toString(),
            deny: o.deny.bitfield.toString(),
        })),
    };
}

function overwriteMap(channel) {
    return new Map([...channel.permissionOverwrites.cache.values()].map(o => [
        o.id, { type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() },
    ]));
}


async function restoreOverwrites(channel, snapshot, { reason = 'Channel filing aborted: restoring permissions' } = {}) {
    const failed = [];
    const wanted = new Map(snapshot.overwrites.map(o => [o.id, o]));
    const current = overwriteMap(channel);

    for (const [id, want] of wanted) {
        const have = current.get(id);
        if (have && have.allow === want.allow && have.deny === want.deny) continue;
        try {
            await channel.client.rest.put(Routes.channelPermission(channel.id, id), {
                body: { type: want.type, allow: want.allow, deny: want.deny },
                reason,
            });
        } catch (err) {
            failed.push({ id, action: 'restore', error: err.message });
        }
    }

    for (const id of current.keys()) {
        if (wanted.has(id)) continue;
        try {
            await channel.client.rest.delete(Routes.channelPermission(channel.id, id), { reason });
        } catch (err) {
            failed.push({ id, action: 'delete', error: err.message });
        }
    }

    let verified = false;
    try {
        const fresh = await channel.guild.channels.fetch(channel.id, { force: true });
        const now = overwriteMap(fresh);
        verified = now.size === wanted.size && [...wanted].every(([id, w]) => {
            const n = now.get(id);
            return n && n.allow === w.allow && n.deny === w.deny;
        });
    } catch (err) {
        failed.push({ id: channel.id, action: 'verify', error: err.message });
    }

    return { ok: failed.length === 0 && verified, verified, failed };
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
    snapshotOverwrites,
    restoreOverwrites,
    TEXT_WRITE_BITS,
    VOICE_WRITE_BITS,
};
