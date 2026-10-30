const { PermissionFlagsBits } = require('discord.js');
const { THREAD_TYPES } = require('../channelFileGuards');
const { sha, fileKey, filesOf, messageLink, withRetry } = require('./helpers');
const { createSnagList } = require('./progress');
const { listThreads, scanIds } = require('./scan');

// ─── The two checks ─────────────────────────────────────────────────────────
// Check 1 (filed copy): every batch is read back while it is being filed (createSink).
//   A full re-read of the destination only happens when asked for
// Check 2 (source): the frozen source and its thread list are scanned again.
async function readDestination(thread) {
    const found = new Map();
    let before;
    while (true) {
        const batch = await withRetry(() => thread.messages.fetch({ limit: 100, before, cache: false }));
        if (!batch.size) break;
        for (const message of batch.values()) {
            found.set(message.id, { h: sha(message.content), files: filesOf(message) });
        }
        before = batch.last().id;
        if (batch.size < 100) break;
    }
    return found;
}

async function verifyFiled(client, job, manifest, { progress, batchStats = null } = {}) {
    const guildId = job.guildId;
    const snags = createSnagList();
    const checks = {};

    // 1 — the filed copy
    if (batchStats) {
        checks.c1 = { ok: true, checked: batchStats.checked, batches: batchStats.batches, bad: 0 };
    } else {
        await progress?.set('Check 1 of 2: reading the filed threads back…', { force: true });
        let checked = 0;
        let bad = 0;
        for (const [threadId, entries] of Object.entries(manifest.dest)) {
            let actual;
            try {
                actual = await readDestination(await client.channels.fetch(threadId));
            } catch (err) {
                bad += entries.length;
                snags.add('dest-mismatch', `The filed thread could not be read back (${err.message})`, { dest: messageLink(guildId, threadId) });
                continue;
            }
            for (const entry of entries) {
                checked++;
                const found = actual.get(entry.id);
                if (!found) {
                    bad++;
                    snags.add('dest-mismatch', 'A filed message is missing from the destination', { dest: messageLink(guildId, threadId, entry.id) });
                } else if (found.h !== entry.h) {
                    bad++;
                    snags.add('dest-mismatch', 'A filed message differs from what was posted', { dest: messageLink(guildId, threadId, entry.id) });
                } else if (fileKey(found.files) !== fileKey(entry.files)) {
                    bad++;
                    snags.add('dest-mismatch', 'A filed message has missing or wrong-sized files', { dest: messageLink(guildId, threadId, entry.id) });
                }
            }
        }
        checks.c1 = { ok: bad === 0, checked, bad };
    }

    // 2 — scan the frozen source again
    await progress?.set('Check 2 of 2: scanning the source again…', { force: true });
    let deleted = 0;
    let extra = 0;
    for (const [unit, ids] of Object.entries(manifest.inventory)) {
        const now = await scanIds(client, unit);
        if (now === null) {
            deleted += ids.length;
            snags.add('deleted-during-filing', `A source thread was deleted during filing (${ids.length} message(s) were filed first)`, { src: messageLink(guildId, unit) });
            continue;
        }
        const original = new Set(ids);
        for (const id of ids) {
            if (!now.has(id)) {
                deleted++;
                snags.add('deleted-during-filing', `Source message ${id} was deleted after it was filed`, { src: messageLink(guildId, unit, id) });
            }
        }
        for (const id of now) if (!original.has(id)) extra++;
    }

    let newThreads = 0;
    try {
        const target = await client.channels.fetch(job.targetId);
        if (!THREAD_TYPES.includes(target.type)) {
            const canSeePrivate = target.permissionsFor(target.guild.members.me).has(PermissionFlagsBits.ManageThreads);
            const now = await listThreads(target, { includePrivateArchived: canSeePrivate });
            newThreads = now.filter(({ thread }) => !manifest.units[thread.id]).length;
        }
    } catch (err) {
        snags.add('note', `Could not re-list the source threads (${err.message})`);
    }
    checks.c2 = { ok: deleted === 0, deleted, extraMessages: extra, newThreads };

    return { checks, snags };
}

module.exports = {
    verifyFiled,
};
