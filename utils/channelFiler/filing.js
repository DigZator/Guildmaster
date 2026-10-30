const { ChannelType, PermissionFlagsBits } = require('discord.js');
const engine = require('../ticketTranscript');
const { THREAD_TYPES } = require('../channelFileGuards');
const { DOWNLOAD_TIMEOUT_MS, BATCH_SIZE, ALLOWED_MENTIONS } = require('./constants');
const { messageLink } = require('./helpers');
const { takenThreadNames, createDestinationThread } = require('./destination');
const { createSnagList } = require('./progress');
const { hasMessages, pagesOf, listThreads } = require('./scan');
const { createSink, createUrlRefresher } = require('./sink');

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

module.exports = {
    typeLabel,
    fileChannel,
};
