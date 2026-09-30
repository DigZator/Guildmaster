const fs   = require('fs');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { downloadAttachment } = require('./downloadAttachment');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

const TEMP_DIR       = path.join(__dirname, '../temp');
const MAX_FILES      = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_CONTENT    = 2000;
const MAX_KEY_LENGTH = 80;
const PENDING_TTL_MS = 10 * 60 * 1000;
const STALE_TEMP_MS  = 60 * 60 * 1000;

let fileCounter = 0;

function stripCodeFence(text) {
    return (text ?? '').replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
}

async function deleteFiles(paths = []) {
    await Promise.allSettled(paths.map(p =>
        fs.promises.unlink(p).catch(err => { if (err.code !== 'ENOENT') throw err; })
    ));
}

async function saveAttachments(attachments, existingCount = 0) {
    const paths = [];
    const skipped = [];
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    for (const att of attachments) {
        if (existingCount + paths.length >= MAX_FILES) {
            skipped.push(`${att.name} (max ${MAX_FILES} files)`);
            continue;
        }
        if (att.size && att.size > MAX_FILE_BYTES) {
            skipped.push(`${att.name} (over ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
            continue;
        }
        const rawExt = path.extname(att.name || '');
        const ext = /^\.[a-z0-9]{1,8}$/i.test(rawExt) ? rawExt : '.png';
        const dest = path.join(TEMP_DIR, `anon_${Date.now()}_${fileCounter++}${ext}`);
        try {
            await downloadAttachment(att.url, dest, { maxBytes: MAX_FILE_BYTES });
            paths.push(dest);
        } catch (err) {
            console.error(`[anon_msg] Failed to download attachment "${att.name}":`, err.message);
            skipped.push(`${att.name} (download failed)`);
        }
    }
    return { paths, skipped };
}

function toAttachments(paths = []) {
    return paths.map(p => new AttachmentBuilder(p, { name: path.basename(p) }));
}

async function sweepStaleTemp() {
    let names;
    try { names = await fs.promises.readdir(TEMP_DIR); } catch { return; }
    const cutoff = Date.now() - STALE_TEMP_MS;
    for (const name of names) {
        if (!name.startsWith('anon_')) continue;
        const full = path.join(TEMP_DIR, name);
        try {
            const stat = await fs.promises.stat(full);
            if (stat.mtimeMs < cutoff) await fs.promises.unlink(full);
        } catch { /* ignore */ }
    }
}

// ── Pending previews (client.anonPending) ───────────────────────────────────
function getPending(client, key) {
    return client.anonPending?.get(key);
}

function setPending(client, key, data) {
    clearPending(client, key);
    if (!client.anonPending) client.anonPending = new Map();
    const timer = setTimeout(() => clearPending(client, key), PENDING_TTL_MS);
    if (timer.unref) timer.unref();
    client.anonPending.set(key, { ...data, filePaths: data.filePaths ?? [], timer });
}

function clearPending(client, key) {
    const pending = client.anonPending?.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    client.anonPending.delete(key);
    deleteFiles(pending.filePaths).catch(err => console.error('[anon_msg] Failed to delete temp file:', err));
}

function takePending(client, key) {
    const pending = client.anonPending?.get(key);
    if (!pending) return null;
    clearTimeout(pending.timer);
    client.anonPending.delete(key);
    return pending;
}

async function collectContent(interaction, { prompt, timeMs, existingCount = 0 }) {
    await interaction.editReply({ content: prompt, embeds: [], components: [], files: [], attachments: [] });

    let reply;
    try {
        const collected = await interaction.channel.awaitMessages({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: timeMs,
            errors: ['time'],
        });
        reply = collected.first();
    } catch {
        return { error: 'timeout' };
    }

    const content = stripCodeFence(reply.content);
    const { paths, skipped } = await saveAttachments([...reply.attachments.values()], existingCount);
    try { await reply.delete(); } catch { /* missing permission — not fatal */ }

    return { content, filePaths: paths, skipped };
}

function validatePayload(content, filePaths) {
    if (!content && filePaths.length === 0) return '❌ Nothing to send — provide message content or an attachment.';
    if (content.length > MAX_CONTENT) return `❌ That message is ${content.length} characters; Discord's limit is ${MAX_CONTENT}.`;
    return null;
}

function skippedNote(skipped = []) {
    return skipped.length ? `\n⚠️ Skipped: ${skipped.join(', ')}` : '';
}

function getAllowedMentions(mentions = false) {
    return mentions ? { parse: ['users', 'roles', 'everyone'] } : { parse: [] };
}

function buildSendOptions(content, filePaths, mentions = false) {
    const opts = { allowedMentions: getAllowedMentions(mentions) };
    if (content) opts.content = content;
    if (filePaths.length) opts.files = toAttachments(filePaths);
    return opts;
}

function isMissingOnDiscord(err) {
    return err?.code === 10008 || err?.code === 10003;   // Unknown Message / Unknown Channel
}

// ── Audit log (private, posted in guildmaster-ctrl) ─────────────────────────
const ACTION_LOG = {
    send:          { title: '📨 Anonymous Message Sent',        color: 0x57F287 },
    edit:          { title: '✏️ Anonymous Message Edited',      color: 0xFEE75C },
    remove:        { title: '🗑️ Anonymous Message Removed',     color: 0xED4245 },
    edit_failed:   { title: '⚠️ Anonymous Message Edit Failed', color: 0xED4245 },
    remove_failed: { title: '⚠️ Anonymous Message Removal Failed', color: 0xED4245 },
};

async function logAnonAction(client, { action, user, key = null, channelId, messageUrl = null, content = null, before = null, note = null, fileCount = 0, mentions = null }) {
    if (!GUILDMASTER_CTRL_CHANNEL_ID) {
        console.warn('[anon_msg] GUILDMASTER_CTRL_CHANNEL_ID is not set — audit log skipped.');
        return false;
    }

    try {
        const channel = await client.channels.fetch(GUILDMASTER_CTRL_CHANNEL_ID);
        const { title, color } = ACTION_LOG[action];

        const main = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setTimestamp()
            .addFields(
                { name: 'Admin',   value: `${user.tag} (<@${user.id}>)`, inline: true },
                { name: 'Key',     value: key ? `\`${key}\`` : '*(none)*', inline: true },
                { name: 'Channel', value: `<#${channelId}>`,             inline: true },
            );

        if (messageUrl)         main.addFields({ name: 'Message',     value: messageUrl,                    inline: true });
        if (fileCount)          main.addFields({ name: 'Attachments', value: String(fileCount),            inline: true });
        if (mentions !== null)  main.addFields({ name: 'Mentions',    value: mentions ? 'on' : 'off',       inline: true });
        if (note)               main.addFields({ name: 'Note',        value: String(note).slice(0, 1000) });

        const embeds = [main];
        if (action === 'edit') {
            embeds.push(new EmbedBuilder().setTitle('Before').setDescription(before || '*(empty)*'));
            embeds.push(new EmbedBuilder().setTitle('After').setDescription(content || '*(empty)*'));
        } else if (content !== null) {
            main.setDescription(content || '*(attachment only)*');
        }

        await channel.send({ embeds, allowedMentions: { parse: [] } });
        return true;
    } catch (err) {
        console.error('[anon_msg] Failed to post audit log:', err);
        return false;
    }
}

function auditWarning(logged) {
    return logged ? '' : '\n⚠️ The audit log entry could not be posted to guildmaster-ctrl.';
}

module.exports = {
    MAX_FILES,
    MAX_CONTENT,
    MAX_KEY_LENGTH,
    stripCodeFence,
    deleteFiles,
    saveAttachments,
    toAttachments,
    sweepStaleTemp,
    getPending,
    setPending,
    clearPending,
    takePending,
    collectContent,
    validatePayload,
    skippedNote,
    buildSendOptions,
    getAllowedMentions,
    isMissingOnDiscord,
    logAnonAction,
    auditWarning,
};
