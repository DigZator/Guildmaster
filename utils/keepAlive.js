const { PermissionFlagsBits, Routes } = require('discord.js');
const keepAliveStore = require('./keepAliveStore');
const { GUILDMASTER_CTRL_CHANNEL_ID, BOT_DEBUGGING_CHANNEL_ID } = require('../data/channels');

const KEEP_ALIVE_DURATION = 10080;
const FLIP_DURATION = 4320;

const REQUIRED_PERMISSIONS = [
    ['ViewChannel', PermissionFlagsBits.ViewChannel, 'View Channel'],
    ['SendMessagesInThreads', PermissionFlagsBits.SendMessagesInThreads, 'Send Messages in Threads'],
    ['ManageThreads', PermissionFlagsBits.ManageThreads, 'Manage Threads'],
];

const METHODS = ['quiet', 'message'];

// quiet   - flips the thread's auto-archive duration and back.
// message - posts a short message in the thread and deletes it. 

function getMethod() {
    const raw = (process.env.KEEP_ALIVE_METHOD || 'quiet').trim().toLowerCase();
    if (!METHODS.includes(raw)) {
        console.warn(`[keepAlive] Unknown KEEP_ALIVE_METHOD "${raw}" — falling back to "quiet".`);
        return 'quiet';
    }
    return raw;
}

function getCtrlChannel(client) {
    const id = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : GUILDMASTER_CTRL_CHANNEL_ID;
    return id ? client.channels.cache.get(id) ?? null : null;
}

function chunkText(text, maxLen = 1900) {
    const chunks = [];
    let current = '';
    for (const line of text.split('\n')) {
        if (current.length + line.length + 1 > maxLen) {
            chunks.push(current);
            current = '';
        }
        current += (current ? '\n' : '') + line;
    }
    if (current) chunks.push(current);
    return chunks;
}

async function sendToCtrl(client, content) {
    const channel = getCtrlChannel(client);
    if (!channel) {
        console.warn('[keepAlive] Control channel not found — could not post:', content.slice(0, 200));
        return false;
    }
    try {
        for (const chunk of chunkText(content)) {
            await channel.send({ content: chunk, allowedMentions: { parse: [] } });
        }
        return true;
    } catch (err) {
        console.error('[keepAlive] Could not post to the control channel:', err.message);
        return false;
    }
}

function missingPermissions(thread, me) {
    const perms = thread.permissionsFor(me);
    if (!perms) return REQUIRED_PERMISSIONS.map(p => p[2]);
    return REQUIRED_PERMISSIONS.filter(([, flag]) => !perms.has(flag)).map(p => p[2]);
}

function shortReason(err) {
    return String(err?.message ?? err).slice(0, 150);
}

// ─── Refresh methods ─────────────────────────────────────────────────────
async function refreshQuiet(client, thread) {
    const reason = 'Keep Alive: resetting the auto-archive timer';
    try {
        await client.rest.patch(Routes.channel(thread.id), {
            body: { auto_archive_duration: FLIP_DURATION },
            reason,
        });
    } finally {
        await client.rest.patch(Routes.channel(thread.id), {
            body: { auto_archive_duration: KEEP_ALIVE_DURATION },
            reason,
        });
    }
    return { messageId: null };
}

async function refreshMessage(client, thread) {
    const msg = await thread.send({ content: '📌 Keep Alive refresh', allowedMentions: { parse: [] } });
    try {
        await msg.delete();
    } catch (err) {
        console.warn(`[keepAlive] Refresh message in ${thread.id} could not be deleted:`, err.message);
    }
    return { messageId: msg.id };
}

async function refreshThread(client, thread, method = getMethod()) {
    let wasArchived = false;
    if (thread.archived) {
        wasArchived = true;
        await thread.setArchived(false, 'Keep Alive: reopening archived thread');
    }
    const { messageId } = method === 'message'
        ? await refreshMessage(client, thread)
        : await refreshQuiet(client, thread);
    return { wasArchived, messageId };
}

// ─── Scheduled job ───────────────────────────────────────────────────────
async function fetchThread(client, threadId) {
    try {
        const channel = await client.channels.fetch(threadId);
        if (!channel || !channel.isThread()) return { gone: true };
        return { thread: channel };
    } catch (err) {
        if (err.code === 10003) return { gone: true };   // Unknown Channel: deleted
        throw err;
    }
}

async function runKeepAliveRefresh(client) {
    const method = getMethod();
    const entries = keepAliveStore.getAll();
    const results = { refreshed: [], reopened: [], failed: [], removed: [] };

    for (const entry of entries) {
        try {
            const { thread, gone } = await fetchThread(client, entry.threadId);
            if (gone) {
                keepAliveStore.remove(entry.threadId);
                results.removed.push(entry);
                continue;
            }

            const { wasArchived, messageId } = await refreshThread(client, thread, method);
            keepAliveStore.markRefreshed(entry.threadId, { messageId });
            (wasArchived ? results.reopened : results.refreshed).push(entry);
        } catch (err) {
            console.error(`[keepAlive] Failed to refresh ${entry.threadId}:`, err);
            results.failed.push({ entry, reason: shortReason(err) });
        }
    }

    await postRefreshReport(client, method, entries.length, results);
    return results;
}

function addedBy(entry) {
    return entry.addedBy ? ` — added by <@${entry.addedBy}>` : '';
}

async function postRefreshReport(client, method, total, results) {
    const ts = Math.floor(Date.now() / 1000);
    let msg = `📌 **Keep Alive refresh ran at <t:${ts}:t>** — method: \`${method}\`, ${total} thread(s) registered.\n`;

    if (total === 0) {
        msg += `\nNo threads are currently registered.`;
    }

    if (results.refreshed.length) {
        msg += `\n**✅ Refreshed (${results.refreshed.length}):**\n`;
        msg += results.refreshed.map(e => `• <#${e.threadId}>${addedBy(e)}`).join('\n') + '\n';
    }
    if (results.reopened.length) {
        msg += `\n**🔓 Was archived — reopened and refreshed (${results.reopened.length}):**\n`;
        msg += results.reopened.map(e => `• <#${e.threadId}>${addedBy(e)}`).join('\n') + '\n';
    }
    if (results.removed.length) {
        msg += `\n**🗑 Removed — thread no longer exists (${results.removed.length}):**\n`;
        msg += results.removed.map(e => `• \`${e.threadId}\`${addedBy(e)}`).join('\n') + '\n';
    }
    if (results.failed.length) {
        msg += `\n**🚨 Failed (${results.failed.length}):**\n`;
        msg += results.failed.map(f => `• <#${f.entry.threadId}> — ${f.reason}`).join('\n') + '\n';
        msg += `\nFailed threads stay registered and will be retried on the next run. Check that the bot has View Channel, Send Messages in Threads and Manage Threads there.`;
    }

    await sendToCtrl(client, msg.trimEnd());
}

// ─── Activity helper (used by the thread report) ─────────────────────────
async function realLastActivity(thread, entry, fallbackFn) {
    if (entry?.lastRefreshMessageId && thread.lastMessageId === entry.lastRefreshMessageId) {
        try {
            const recent = await thread.messages.fetch({ limit: 1 });
            const newest = recent.first();
            return newest ? newest.createdTimestamp : thread.createdTimestamp;
        } catch {
            return thread.createdTimestamp;
        }
    }
    return fallbackFn(thread);
}

// ─── Event listeners ─────────────────────────────────────────────────────
function initListeners(client) {
    client.on('threadUpdate', async (oldThread, newThread) => {
        try {
            if (oldThread.archived || !newThread.archived) return;
            if (!keepAliveStore.has(newThread.id)) return;

            await newThread.setArchived(false, 'Keep Alive: thread was archived unexpectedly');
            await sendToCtrl(client,
                `🔄 **Keep Alive safety net:** <#${newThread.id}> was archived and has been reopened. ` +
                `If this keeps happening, the refresh method (\`${getMethod()}\`) may not be resetting the timer. ` +
                `To archive it on purpose, run \`/keep_alive\` in it first to switch Keep Alive off.`
            );
        } catch (err) {
            console.error('[keepAlive] Safety-net reopen failed:', err);
            await sendToCtrl(client,
                `🚨 **Keep Alive safety net failed:** <#${newThread.id}> was archived and I could not reopen it (${shortReason(err)}).`
            );
        }
    });

    client.on('threadDelete', async (thread) => {
        try {
            const result = keepAliveStore.remove(thread.id);
            if (result.success) {
                await sendToCtrl(client, `🗑 Kept-alive thread \`${thread.name ?? thread.id}\` (\`${thread.id}\`) was deleted — removed from the Keep Alive list.`);
            }
        } catch (err) {
            console.error('[keepAlive] threadDelete cleanup failed:', err);
        }
    });
}

module.exports = {
    KEEP_ALIVE_DURATION,
    getMethod,
    missingPermissions,
    refreshThread,
    runKeepAliveRefresh,
    realLastActivity,
    sendToCtrl,
    initListeners,
};
