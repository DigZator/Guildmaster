const { ChannelType, ThreadAutoArchiveDuration } = require('discord.js');

// ─── Names ──────────────────────────────────────────────────────────────────
function formatThreadName({ base, suffix = '' }) {
    const room = 100 - suffix.length;
    const name = base.length > room ? `${base.slice(0, Math.max(1, room - 1))}…` : base;
    return `${name}${suffix}`;
}

function abortedName(name) {
    return `aborted · ${name}`.slice(0, 100);
}

async function takenThreadNames(location) {
    const names = new Set();
    try {
        const active = await location.threads.fetchActive();
        for (const thread of active.threads.values()) names.add(thread.name);
    } catch (err) {
        console.warn('[channelFiler] Could not list active threads for the name check:', err.message);
    }
    try {
        let before;
        for (let page = 0; page < 3; page++) {
            const res = await location.threads.fetchArchived({ type: 'public', limit: 100, before });
            for (const thread of res.threads.values()) names.add(thread.name);
            if (!res.hasMore) break;
            before = res.threads.last();
        }
    } catch (err) {
        console.warn('[channelFiler] Could not list archived threads for the name check:', err.message);
    }
    return names;
}

async function createDestinationThread(location, { base, isPrivate, jobId, reason, used }) {
    const taken = used ?? await takenThreadNames(location);
    let name = formatThreadName({ base });
    if (taken.has(name)) name = formatThreadName({ base, suffix: ` · ${jobId.slice(0, 6)}` });
    taken.add(name);

    return location.threads.create({
        name,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        type: isPrivate ? ChannelType.PrivateThread : ChannelType.PublicThread,
        invitable: isPrivate ? false : undefined,
        reason,
    });
}

module.exports = {
    formatThreadName,
    abortedName,
    takenThreadNames,
    createDestinationThread,
};
