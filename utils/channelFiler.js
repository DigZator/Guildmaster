const fs = require('fs');
const crypto = require('crypto');
const {
    ChannelType, PermissionFlagsBits, ThreadAutoArchiveDuration, AttachmentBuilder,
} = require('discord.js');
const engine = require('./ticketTranscript');
const archive = require('./archiveChannel');
const jobsStore = require('./channelFileJobs');
const { THREAD_TYPES } = require('./channelFileGuards');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

const SEND_ATTEMPTS = 4;
const FETCH_ATTEMPTS = 4;
const RETRY_BASE_MS = 1500;
const DOWNLOAD_TIMEOUT_MS = 60 * 1000;
const MAX_SNAGS = 200;
const PROGRESS_INTERVAL_MS = 10 * 1000;

const BATCH_SIZE = 64;
const BATCH_CHECK_ATTEMPTS = 3;
const BATCH_CHECK_RETRY_MS = Number(process.env.CHANNEL_FILE_BATCH_RETRY_MS) || 2000;
const NO_MESSAGES_TYPES = [ChannelType.GuildForum, ChannelType.GuildMedia];
const ALLOWED_MENTIONS = { parse: [] };

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = text => crypto.createHash('sha1').update(String(text ?? '').trim()).digest('hex').slice(0, 12);
const byId = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1);
const fileKey = files => files.map(([name, size]) => `${name}:${size}`).sort().join('|');
const filesOf = message => [...message.attachments.values()].map(a => [a.name, a.size]);
const messageLink = (guildId, channelId, messageId) => `https://discord.com/channels/${guildId}/${channelId}${messageId ? `/${messageId}` : ''}`;

function isRetryable(err) {
    const status = err?.status;
    return !status || status >= 500 || status === 429;
}

async function withRetry(fn, { attempts = FETCH_ATTEMPTS, baseMs = RETRY_BASE_MS } = {}) {
    let lastError;
    for (let n = 1; n <= attempts; n++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (!isRetryable(err) || n === attempts) break;
            await sleep(baseMs * 2 ** (n - 1));
        }
    }
    throw lastError;
}

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

// ─── Snags ──────────────────────────────────────────────────────────────────
function createSnagList(existing = []) {
    const list = [...existing];
    let overflow = 0;
    return {
        list,
        get overflow() { return overflow; },
        add(kind, message, extra = {}) {
            if (list.length >= MAX_SNAGS) { overflow++; return; }
            list.push({ kind, message, ...extra });
        },
    };
}

// ─── Progress ───────────────────────────────────────────────────────────────
function createProgress(message, title) {
    let last = 0;
    return {
        async set(text, { force = false } = {}) {
            if (!message) return;
            const now = Date.now();
            if (!force && now - last < PROGRESS_INTERVAL_MS) return;
            last = now;
            await message.edit({ content: `⏳ **${title}**\n${text}`.slice(0, 2000), embeds: [], components: [] }).catch(() => {});
        },
    };
}

// ─── Freeze / unfreeze ──────────────────────────────────────────────────────
async function freezeTarget(client, job, target) {
    const isThread = THREAD_TYPES.includes(target.type);
    const reason = `Channel filing ${job.id.slice(0, 8)}: frozen`;

    const snapshot = isThread
        ? { channelId: target.id, guildId: target.guild.id, takenAt: Date.now(), overwrites: [], thread: true }
        : archive.snapshotOverwrites(target);
    await jobsStore.saveSnapshot(job.id, snapshot);

    try {
        const control = await client.channels.fetch(GUILDMASTER_CTRL_CHANNEL_ID);
        await control.send({
            content: `🔐 Permission backup for filing \`${job.id.slice(0, 8)}\` (**${target.name}**)`,
            files: [new AttachmentBuilder(Buffer.from(JSON.stringify(snapshot, null, 2)), { name: `permissions-${job.id.slice(0, 8)}.json` })],
        });
    } catch (err) {
        console.warn('[channelFiler] Could not post the permission backup:', err.message);
    }

    const locked = [];
    const issues = [];
    try {
        if (isThread) {
            if (!target.locked) {
                try {
                    await target.setLocked(true, reason);
                    locked.push(target.id);
                } catch (err) {
                    issues.push(`The thread could not be locked (${err.message}). Messages posted while filing runs will not be copied.`);
                }
            }
        } else {
            try {
                const result = await archive.lockChannelToReadOnly(target, {
                    reason,
                    includeTextBits: [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(target.type),
                });
                if (result?.skipped?.length) {
                    issues.push(`${result.skipped.length} role/member override(s) could not be made read-only, so those people may still be able to post in the channel.`);
                }
            } catch (err) {
                issues.push(`The channel could not be made read-only (${err.message}). Messages posted while filing runs will not be copied and will be lost if you proceed.`);
            }

            if (target.threads?.fetchActive) {
                let failedThreads = 0;
                try {
                    const active = await target.threads.fetchActive();
                    for (const thread of active.threads.values()) {
                        if (thread.locked) continue;
                        try {
                            await thread.setLocked(true, reason);
                            locked.push(thread.id);
                        } catch (err) {
                            failedThreads++;
                            console.warn(`[channelFiler] Could not lock thread ${thread.id}:`, err.message);
                        }
                    }
                } catch (err) {
                    issues.push(`The active threads could not be listed to lock them (${err.message}).`);
                }
                if (failedThreads) issues.push(`${failedThreads} active thread(s) could not be locked, so they may still receive messages.`);
            }
        }
    } finally {
        await jobsStore.updateJob(job.id, { lockedThreadIds: locked });
    }

    return { issues };
}

async function unfreezeTarget(client, job) {
    const problems = [];
    const snapshot = jobsStore.loadSnapshot(job.id);

    if (snapshot && !snapshot.thread) {
        try {
            const channel = await client.channels.fetch(job.targetId);
            const result = await archive.restoreOverwrites(channel, snapshot, { reason: `Channel filing ${job.id.slice(0, 8)}: restoring permissions` });
            if (!result.ok) {
                problems.push(`Permissions were not fully restored (${result.failed.map(f => `${f.action} ${f.id}: ${f.error}`).join('; ') || 'verification failed'})`);
            }
        } catch (err) {
            problems.push(`Could not restore permissions: ${err.message}`);
        }
    }

    for (const id of job.lockedThreadIds ?? []) {
        try {
            const thread = await client.channels.fetch(id);
            if (thread?.locked) await thread.setLocked(false, `Channel filing ${job.id.slice(0, 8)}: unlocking`);
        } catch (err) {
            if (err.status !== 404) problems.push(`Could not unlock <#${id}>: ${err.message}`);
        }
    }

    return problems;
}

// ─── Reading sources ────────────────────────────────────────────────────────
function hasMessages(channel) {
    return !NO_MESSAGES_TYPES.includes(channel.type);
}

async function* pagesOf(channel, { pageSize = 100 } = {}) {
    let after = '0';
    let joined = false;

    while (true) {
        let batch;
        try {
            batch = await withRetry(() => channel.messages.fetch({ limit: pageSize, after, cache: false }));
        } catch (err) {
            if (!joined && THREAD_TYPES.includes(channel.type) && channel.joinable) {
                joined = true;
                await channel.join();
                continue;
            }
            throw err;
        }

        if (!batch.size) return;
        const page = [...batch.values()].sort(byId);
        yield page;
        after = page[page.length - 1].id;
        if (batch.size < pageSize) return;
    }
}

async function listThreads(target, { includePrivateArchived }) {
    if (!target.threads?.fetchActive) return [];
    const found = new Map();

    const active = await withRetry(() => target.threads.fetchActive());
    for (const thread of active.threads.values()) found.set(thread.id, thread);

    const sweep = async options => {
        let before;
        while (true) {
            const res = await withRetry(() => target.threads.fetchArchived({ ...options, limit: 100, before }));
            for (const thread of res.threads.values()) found.set(thread.id, thread);
            if (!res.hasMore || !res.threads.size) break;
            before = res.threads.last();
        }
    };
    await sweep({ type: 'public' });
    if (includePrivateArchived) await sweep({ type: 'private', fetchAll: true });

    return [...found.values()]
        .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
        .map(thread => ({ thread, isPrivate: thread.type === ChannelType.PrivateThread }));
}

async function scanIds(client, channelId) {
    let channel;
    try {
        channel = await client.channels.fetch(channelId);
    } catch (err) {
        if (err.status === 404 || err.code === 10003) return null;
        throw err;
    }
    if (!channel) return null;

    const ids = new Set();
    for await (const page of pagesOf(channel)) for (const message of page) ids.add(message.id);
    return ids;
}

// ─── Posting ────────────────────────────────────────────────────────────────
function sizeOfFile(builder) {
    const data = builder.attachment;
    return Buffer.isBuffer(data) ? data.length : fs.statSync(data).size;
}

async function readPostedRange(thread, entries) {
    const found = new Map();
    const lastId = BigInt(entries[entries.length - 1].id);
    let after = (BigInt(entries[0].id) - 1n).toString();

    while (true) {
        const batch = await withRetry(() => thread.messages.fetch({ limit: 100, after, cache: false }));
        if (!batch.size) break;
        const page = [...batch.values()].sort(byId);
        for (const message of page) found.set(message.id, { h: sha(message.content), files: filesOf(message) });
        after = page[page.length - 1].id;
        if (BigInt(after) >= lastId || batch.size < 100) break;
    }
    return found;
}

const postMatches = (found, entry) => Boolean(found) && found.h === entry.h && fileKey(found.files) === fileKey(entry.files);

function createSink(thread, stats = { checked: 0, batches: 0 }) {
    const record = [];
    let verifiedUpTo = 0;

    const send = async payload => {
        const sent = await withRetry(() => thread.send(payload), { attempts: SEND_ATTEMPTS });
        record.push({
            id: sent.id,
            h: sha(payload.content),
            files: (payload.files ?? []).map(file => [file.name, sizeOfFile(file)]),
        });
        return sent;
    };

    const edit = async (messageId, content) => {
        const message = await withRetry(() => thread.messages.fetch(messageId));
        const updated = await withRetry(() => message.edit({ content, allowedMentions: ALLOWED_MENTIONS }));
        if (sha(updated?.content) !== sha(content)) throw new Error('An edited post in the filed thread did not take effect');
        const entry = record.find(r => r.id === messageId);
        if (entry) entry.h = sha(content);
    };

    const checkpoint = async () => {
        const entries = record.slice(verifiedUpTo);
        if (!entries.length) return;

        let problems = entries;
        for (let attempt = 1; attempt <= BATCH_CHECK_ATTEMPTS; attempt++) {
            const found = await readPostedRange(thread, entries);
            problems = entries.filter(entry => !postMatches(found.get(entry.id), entry));
            if (!problems.length) break;
            if (attempt < BATCH_CHECK_ATTEMPTS) await sleep(BATCH_CHECK_RETRY_MS * attempt);
        }
        if (problems.length) {
            throw new Error(`Batch check failed: ${problems.length} of ${entries.length} post(s) in the filed thread are missing or different`);
        }

        verifiedUpTo = record.length;
        stats.checked += entries.length;
        stats.batches++;
    };

    return { thread, record, send, edit, checkpoint };
}

function createUrlRefresher(client) {
    const EXPIRY_MARGIN_MS = 15 * 60 * 1000;

    const expiringSoon = url => {
        try {
            const ex = new URL(url).searchParams.get('ex');
            return ex ? parseInt(ex, 16) * 1000 - Date.now() < EXPIRY_MARGIN_MS : false;
        } catch {
            return false;
        }
    };

    return async (file, attempt) => {
        if (!file.messageId || !file.channelId) return null;
        if (attempt === 1 && !expiringSoon(file.url)) return null;

        const channel = await client.channels.fetch(file.channelId);
        const message = await channel.messages.fetch({ message: file.messageId, force: true, cache: false });
        if (file.embedRef) return message.embeds[file.embedRef.index]?.[file.embedRef.key]?.url ?? null;
        return message.attachments.get(file.id)?.url ?? null;
    };
}

function typeLabel(type) {
    switch (type) {
        case ChannelType.GuildText: return 'text channel';
        case ChannelType.GuildAnnouncement: return 'announcement channel';
        case ChannelType.GuildVoice: return 'voice channel';
        case ChannelType.GuildStageVoice: return 'stage channel';
        case ChannelType.GuildForum: return 'forum';
        case ChannelType.GuildMedia: return 'media channel';
        default: return 'thread';
    }
}

async function fileUnit({ source, sink, run, onPage }) {
    const { guild, manifest, snags, refresh, renderOptions } = run;
    const renderState = {};
    const inventory = manifest.inventory[source.id] = [];

    let count = 0;
    let first = null;
    let last = null;

    for await (const page of pagesOf(source, { pageSize: BATCH_SIZE })) {
        const rendered = engine.renderHistory(page, renderOptions, renderState);

        for (const chunk of engine.chunkLines(rendered.lines)) {
            await sink.send({ content: chunk, allowedMentions: ALLOWED_MENTIONS });
        }
        for (const message of page) inventory.push(message.id);

        if (rendered.attachmentGroups.length || rendered.lost.length) {
            const posted = await engine.postAttachmentGroups(sink.thread, rendered.attachmentGroups, {
                initialNotPreserved: rendered.lost.map(item => `${item.name} (${item.reason})`),
                send: sink.send,
                refreshUrl: refresh,
                timeoutMs: DOWNLOAD_TIMEOUT_MS,
                header: false,
            });

            for (const item of rendered.lost) {
                snags.add('lost-file', `${item.name} was not preserved (${item.reason})`, { size: item.size, src: messageLink(guild.id, item.channelId, item.messageId) });
                run.lost.count++;
                run.lost.bytes += item.size ?? 0;
            }
            for (const { file, reason } of posted.failures) {
                snags.add('lost-file', `${file.name} was not preserved (${reason})`, { size: file.size, src: messageLink(guild.id, file.channelId, file.messageId) });
                run.lost.count++;
                run.lost.bytes += file.size ?? 0;
            }
            run.files += posted.reposted;
        }

        await sink.checkpoint();

        count += page.length;
        first ??= page[0].createdTimestamp;
        last = page[page.length - 1].createdTimestamp;
        await onPage?.(count);
    }

    if (!count) {
        await sink.send({ content: '*No messages.*', allowedMentions: ALLOWED_MENTIONS });
        await sink.checkpoint();
    }

    return { count, first, last };
}

function summaryRows({ count, first, last }, extra = []) {
    return [
        ...extra,
        ['Messages', String(count)],
        first ? ['First / last message', `${engine.formatStamp(first)} → ${engine.formatStamp(last)}`] : null,
    ].filter(Boolean);
}

async function fileChannel(client, job, { progress, onThreadCreated }) {
    const target = await client.channels.fetch(job.targetId);
    const location = await client.channels.fetch(job.locationId);
    const guild = target.guild;
    const isThread = THREAD_TYPES.includes(target.type);
    const canSeePrivate = !isThread && target.permissionsFor(guild.members.me).has(PermissionFlagsBits.ManageThreads);

    const children = isThread ? [] : await listThreads(target, { includePrivateArchived: canSeePrivate });
    const publicCount = children.filter(c => !c.isPrivate).length;
    const privateCount = children.length - publicCount;

    const snags = createSnagList();
    for (const issue of job.freezeIssues ?? []) snags.add('freeze', issue);
    const batchStats = { checked: 0, batches: 0 };
    const manifest = { inventory: {}, dest: {}, units: {} };
    const run = {
        guild, manifest, snags,
        lost: { count: 0, bytes: 0 },
        files: 0,
        refresh: createUrlRefresher(client),
        renderOptions: {
            preserveAttachments: true,
            maxFileBytes: engine.uploadLimitBytes(guild),
            includeEmbedImages: true,
            labelSystemMessages: true,
        },
    };

    const usedNames = await takenThreadNames(location);
    const privateReport = [];
    let totalMessages = 0;
    let privateN = 0;

    const create = async (base, isPrivate, label) => {
        const thread = await createDestinationThread(location, {
            base, isPrivate, jobId: job.id, used: usedNames,
            reason: `Channel filing ${job.id.slice(0, 8)}`,
        });
        await onThreadCreated({ id: thread.id, kind: label });
        const sink = createSink(thread, batchStats);
        manifest.dest[thread.id] = sink.record;
        return sink;
    };

    // ── Main thread + header ────────────────────────────────────────────────
    const main = await create(target.name, job.isPrivate, 'main');
    const category = (isThread ? target.parent?.parent : target.parent)?.name;
    const headerMeta = [
        ['Channel', `#${target.name} (${typeLabel(target.type)})`],
        target.topic ? ['Topic', String(target.topic).replace(/\s+/g, ' ').slice(0, 500)] : null,
        category ? ['Category', category] : null,
        target.createdTimestamp ? ['Created', engine.formatStamp(target.createdTimestamp)] : null,
        children.length ? ['Threads', `${publicCount} public (below), ${privateCount} private (filed separately)`] : null,
        ['Filed on', engine.formatStamp(job.startedAt)],
        ['Filed by', `<@${job.startedBy}>`],
    ].filter(Boolean);
    const headerFor = extraRows => engine.chunkLines(engine.buildHeaderLines({
        header: `🗄️ Filed channel — #${target.name}`,
        meta: [...headerMeta, ...extraRows],
    }))[0];

    const headerMessage = await main.send({ content: headerFor([]), allowedMentions: ALLOWED_MENTIONS });

    // ── Main chat ───────────────────────────────────────────────────────────
    let mainStats = { count: 0, first: null, last: null };
    manifest.units[target.id] = { dest: main.thread.id, kind: 'main', name: target.name };

    if (hasMessages(target)) {
        mainStats = await fileUnit({
            source: target, sink: main, run,
            onPage: n => progress.set(`Filing the main chat… ${n} messages so far`),
        });
    } else {
        await main.send({ content: '*This channel has no chat of its own — each post is filed below as a thread.*', allowedMentions: ALLOWED_MENTIONS });
    }
    totalMessages += mainStats.count;

    // ── Child threads, oldest first ─────────────────────────────────────────
    let done = 0;
    for (const { thread, isPrivate } of children) {
        done++;
        await progress.set(`Filing thread ${done} of ${children.length}… (${totalMessages} messages so far)`, { force: true });
        manifest.units[thread.id] = { dest: null, kind: isPrivate ? 'private' : 'public', name: thread.name };

        if (!isPrivate) {
            manifest.units[thread.id].dest = main.thread.id;
            await main.send({
                content: `━━━━━━━━━━ 🧵 **THREAD START** ━━━━━━━━━━\n**${thread.name}** · created ${thread.createdTimestamp ? engine.formatStamp(thread.createdTimestamp) : 'unknown'}`.slice(0, 2000),
                allowedMentions: ALLOWED_MENTIONS,
            });
            const stats = await fileUnit({
                source: thread, sink: main, run,
                onPage: n => progress.set(`Filing thread ${done} of ${children.length}… (${totalMessages + n} messages so far)`),
            });
            totalMessages += stats.count;
            const range = stats.first ? `${engine.formatStamp(stats.first)} → ${engine.formatStamp(stats.last)}` : 'no messages';
            await main.send({
                content: `━━━━━━━━━━ 🧵 **THREAD END** ━━━━━━━━━━\n**${thread.name}** · ${stats.count} message(s) · ${range}`.slice(0, 2000),
                allowedMentions: ALLOWED_MENTIONS,
            });
            await main.checkpoint();
            continue;
        }

        privateN++;
        let memberIds = [];
        let membersKnown = true;
        try {
            memberIds = [...(await thread.members.fetch()).keys()];
        } catch (err) {
            membersKnown = false;
            snags.add('note', `Could not read the member list of private thread "${thread.name}" (${err.message})`, { src: messageLink(guild.id, thread.id) });
        }

        const sink = await create(`${target.name} · private-${privateN}`, true, 'private');
        manifest.units[thread.id].dest = sink.thread.id;

        const privateHeader = extraRows => engine.chunkLines(engine.buildHeaderLines({
            header: `🔒 Filed private thread — ${thread.name}`,
            meta: [
                ['From channel', `#${target.name}`],
                thread.createdTimestamp ? ['Created', engine.formatStamp(thread.createdTimestamp)] : null,
                thread.ownerId ? ['Started by', `<@${thread.ownerId}>`] : null,
                ['Original members', membersKnown ? (memberIds.map(id => `<@${id}>`).join(', ') || 'none') : 'unknown'],
                ['Filed on', engine.formatStamp(job.startedAt)],
                ['Filed by', `<@${job.startedBy}>`],
                ...extraRows,
            ].filter(Boolean),
        }))[0];
        const privateHeaderMessage = await sink.send({ content: privateHeader([]), allowedMentions: ALLOWED_MENTIONS });

        const stats = await fileUnit({
            source: thread, sink, run,
            onPage: n => progress.set(`Filing private thread ${privateN} of ${privateCount}… (${totalMessages + n} messages so far)`),
        });
        totalMessages += stats.count;
        await sink.edit(privateHeaderMessage.id, privateHeader(summaryRows(stats)));
        await sink.checkpoint();

        privateReport.push({ n: privateN, originalName: thread.name, threadId: sink.thread.id, memberIds, membersKnown });
        await main.send({ content: '🔒 *A private thread was filed separately.*', allowedMentions: ALLOWED_MENTIONS });
        await main.checkpoint();
    }

    // ── Final header with counts ────────────────────────────────────────────
    await main.edit(headerMessage.id, headerFor([
        ...summaryRows({ ...mainStats, count: totalMessages }, [['Attachments reposted', String(run.files)]]),
        run.lost.count ? ['Not preserved', `${run.lost.count} file(s)`] : null,
    ].filter(Boolean)));
    await main.checkpoint();

    return {
        manifest,
        snags,
        privateReport,
        lost: run.lost,
        counts: { messages: totalMessages, files: run.files, publicThreads: publicCount, privateThreads: privateCount },
        batchStats,
        mainThreadId: main.thread.id,
    };
}

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

// ─── Hard revert ────────────────────────────────────────────────────────────
async function hardRevert(client, jobId, reason) {
    const job = jobsStore.getJob(jobId);
    if (!job) return { ok: true, problems: [], threads: [] };

    await jobsStore.updateJob(jobId, { phase: jobsStore.PHASES.aborting }).catch(() => {});

    const problems = await unfreezeTarget(client, job);

    const threads = [];
    for (const created of job.createdThreads ?? []) {
        try {
            const thread = await client.channels.fetch(created.id);
            if (!thread.name.startsWith('aborted · ')) await thread.setName(abortedName(thread.name));
            threads.push(created.id);
        } catch (err) {
            if (err.status !== 404) problems.push(`Could not mark <#${created.id}> as aborted: ${err.message}`);
        }
    }

    if (problems.length) {
        await jobsStore.updateJob(jobId, { phase: jobsStore.PHASES.review, failed: reason, revertProblems: problems }).catch(() => {});
    } else {
        await jobsStore.removeJob(jobId);
    }

    return { ok: problems.length === 0, problems, threads };
}

module.exports = {
    formatThreadName,
    abortedName,
    messageLink,
    createSnagList,
    createProgress,
    freezeTarget,
    unfreezeTarget,
    listThreads,
    fileChannel,
    verifyFiled,
    hardRevert,
    typeLabel,
    MAX_SNAGS,
    BATCH_SIZE,
    createSink,
};
