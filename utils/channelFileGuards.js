const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { createJsonStore } = require('./jsonStore');
const channelIds = require('../data/channels');
const channelFileJobs = require('./channelFileJobs');
const { freeDiskBytes, MIN_FREE_DISK_BYTES } = require('./ticketTranscript');

const THREAD_TYPES = [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread];

const SUPPORTED_TARGET_TYPES = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
    ...THREAD_TYPES,
];

const MAX_LEAK_NAMES = 5;

const protectedStore = createJsonStore(process.env.CHANNEL_FILE_PROTECTED_PATH || path.join(__dirname, '../data/channelFileProtected.json'), []);

// ─── Manual protect list (starts empty; admins add channels) ───────────────
function listProtected() {
    return protectedStore.load();
}

function addProtected(channelId, addedBy) {
    const entries = listProtected();
    if (entries.some(e => e.channelId === channelId)) return { error: 'That channel is already on the protect list.' };
    entries.push({ channelId, addedBy, addedAt: Date.now() });
    protectedStore.save(entries);
    return { success: true };
}

function removeProtected(channelId) {
    const entries = listProtected();
    const next = entries.filter(e => e.channelId !== channelId);
    if (next.length === entries.length) return { error: 'That channel is not on the protect list.' };
    protectedStore.save(next);
    return { success: true };
}

// ─── Always protected (the filing cannot work without these) ────────────────
function getAlwaysProtectedIds() {
    const map = new Map();
    if (channelIds.GUILDMASTER_CTRL_CHANNEL_ID) {
        map.set(channelIds.GUILDMASTER_CTRL_CHANNEL_ID, 'it is the control channel where filing progress and reviews are posted');
    }
    return map;
}

// ─── Discord-native channels: a warning only, never a block ─────────────────
function getNativeProtectedIds(guild) {
    const map = new Map();
    const add = (id, reason) => { if (id) map.set(id, reason); };
    add(guild.rulesChannelId, 'it is the server rules channel');
    add(guild.publicUpdatesChannelId, 'it is the community updates channel');
    add(guild.safetyAlertsChannelId, 'it is the safety alerts channel');
    add(guild.systemChannelId, 'it is the system messages channel');
    add(guild.afkChannelId, 'it is the AFK channel');
    return map;
}

function getProtectionReason(guild, channel, { locationId } = {}) {
    const always = getAlwaysProtectedIds();

    const ids = [channel.id];
    if (THREAD_TYPES.includes(channel.type) && channel.parentId) ids.push(channel.parentId);

    for (const id of ids) {
        if (always.has(id)) return `${always.get(id)}${id !== channel.id ? ' (its parent channel)' : ''}`;
    }

    if (locationId && channel.id === locationId) return 'it is the destination channel for this filing';
    if (listProtected().some(e => e.channelId === channel.id)) return 'it is on the manual protect list';
    return null;
}

// ─── Guard checks ───────────────────────────────────────────────────────────
function missingPerms(channel, member, bits) {
    const perms = channel.permissionsFor(member);
    if (!perms) return ['all permissions (could not be resolved)'];
    return Object.entries(PermissionFlagsBits)
        .filter(([, bit]) => bits.includes(bit) && !perms.has(bit))
        .map(([name]) => name);
}

async function findAudienceLeak(guild, target, location) {
    if (target.type === ChannelType.PrivateThread) {
        return 'The target is a private thread, so a public copy would widen who can read it.';
    }
    const source = THREAD_TYPES.includes(target.type) ? target.parent : target;
    if (!source) return null;

    const leaking = [];
    for (const role of guild.roles.cache.values()) {
        const seesDestination = location.permissionsFor(role)?.has(PermissionFlagsBits.ViewChannel);
        const seesSource = source.permissionsFor(role)?.has(PermissionFlagsBits.ViewChannel);
        if (seesDestination && !seesSource) leaking.push(role.id === guild.id ? '@everyone' : role.name);
    }
    if (!leaking.length) return null;

    const shown = leaking.slice(0, MAX_LEAK_NAMES).join(', ');
    const more = leaking.length > MAX_LEAK_NAMES ? ` and ${leaking.length - MAX_LEAK_NAMES} more` : '';
    return `A public copy would be readable by roles that cannot see the original: ${shown}${more}. (Per-member overrides are not checked.)`;
}

async function runGuards({ guild, target, location, isPrivate }) {
    const blocking = [];
    const warnings = [];
    const me = guild.members.me;
    const isThread = THREAD_TYPES.includes(target.type);

    if (target.type === ChannelType.GuildCategory) {
        blocking.push('Categories cannot be filed — pick a channel inside it.');
    } else if (!SUPPORTED_TARGET_TYPES.includes(target.type)) {
        blocking.push('That channel type cannot be filed.');
    }

    if (location.type !== ChannelType.GuildText) {
        blocking.push('The location must be a text channel.');
    }

    const reason = getProtectionReason(guild, target, { locationId: location.id });
    if (reason) blocking.push(`Protected: ${reason}.`);

    const active = channelFileJobs.getActiveJobForTarget(target.id);
    if (active) blocking.push(`A filing for this channel is already in progress (phase: ${active.phase}).`);

    if (blocking.length && !SUPPORTED_TARGET_TYPES.includes(target.type)) return { blocking, warnings };

    const targetNeeds = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
    targetNeeds.push(isThread ? PermissionFlagsBits.ManageThreads : PermissionFlagsBits.ManageChannels);
    const missingTarget = missingPerms(target, me, targetNeeds);
    if (missingTarget.length) blocking.push(`I am missing permissions on the target: ${missingTarget.join(', ')}.`);

    if (!isThread && missingPerms(target, me, [PermissionFlagsBits.ManageRoles]).length) {
        warnings.push('I lack **Manage Permissions** on the target, so I cannot make it read-only. Messages posted while I file will **not** be copied and will be lost when the channel is deleted.');
    }

    const nativeReason = getNativeProtectedIds(guild).get(target.id);
    if (nativeReason) {
        warnings.push(`${nativeReason.charAt(0).toUpperCase()}${nativeReason.slice(1)}. Discord may refuse to delete it, or deleting it will change a server setting, so the final delete step could fail.`);
    }

    const locationNeeds = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
    ];
    const missingLocation = missingPerms(location, me, locationNeeds);
    if (missingLocation.length) blocking.push(`I am missing permissions on the location: ${missingLocation.join(', ')}.`);

    if (!isThread && missingPerms(target, me, [PermissionFlagsBits.ManageThreads]).length) {
        warnings.push('I lack **Manage Threads** on the target — archived and private threads will be invisible to me, so they will **not** be filed or checked, and they will be lost when the channel is deleted.');
    }

    if (!isPrivate) {
        const leak = await findAudienceLeak(guild, target, location);
        if (leak) warnings.push(leak);
    }

    if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(target.type)) {
        const connected = target.members?.size ?? 0;
        if (connected > 0) warnings.push(`${connected} member(s) are connected to this voice channel — deleting it will disconnect them.`);

        try {
            const events = await guild.scheduledEvents.fetch();
            const linked = [...events.values()].filter(e => e.channelId === target.id).length;
            if (linked > 0) warnings.push(`${linked} scheduled event(s) are linked to this channel and will disappear with it.`);
        } catch (err) {
            console.warn('[channelFileGuards] Could not check scheduled events:', err.message);
        }
        warnings.push('Only the text chat inside this voice channel is filed — the voice channel itself has no history.');
    }

    const freeBytes = freeDiskBytes(channelFileJobs.JOBS_DIR);
    if (freeBytes < MIN_FREE_DISK_BYTES) {
        blocking.push(`The bot's disk is nearly full (${Math.floor(freeBytes / 1024 / 1024)} MB free) — free up space first.`);
    } else if (freeBytes < 4 * MIN_FREE_DISK_BYTES) {
        warnings.push(`The bot's disk is getting low (${Math.floor(freeBytes / 1024 / 1024)} MB free). Normal filings use almost no disk, but very large attachments may be skipped.`);
    }

    return { blocking, warnings };
}

module.exports = {
    SUPPORTED_TARGET_TYPES,
    THREAD_TYPES,
    listProtected,
    addProtected,
    removeProtected,
    getNativeProtectedIds,
    getAlwaysProtectedIds,
    getProtectionReason,
    runGuards,
};
