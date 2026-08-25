const path = require('path');
const { createJsonStore } = require('./jsonStore');
const { BOT_LOG_CHANNEL_ID } = require('../data/channels');

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DISCORD_EPOCH = 1420070400000n;

const store = createJsonStore(path.join(__dirname, '../data/threadReport.json'), { nextReportDue: null });

function timestampFromSnowflake(id) {
    return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}

function lastActivityTimestamp(thread) {
    if (thread.lastMessageId) return timestampFromSnowflake(thread.lastMessageId);
    return thread.createdTimestamp;
}

function chunkLines(lines, maxLen = 1900) {
    const chunks = [];
    let current = '';
    for (const line of lines) {
        if (current.length + line.length + 1 > maxLen) {
            chunks.push(current);
            current = '';
        }
        current += (current ? '\n' : '') + line;
    }
    if (current) chunks.push(current);
    return chunks;
}

function formatThreadLine(thread) {
    const lastActive = Math.floor(lastActivityTimestamp(thread) / 1000);
    const parentMention = thread.parentId ? `<#${thread.parentId}>` : 'unknown channel';
    return `• <#${thread.id}> in ${parentMention} — last activity <t:${lastActive}:R>`;
}

function withBlankLines(lines) {
    return lines.flatMap((line, i) => i < lines.length - 1 ? [line, ''] : [line]);
}

async function runThreadActivityReport(client) {
    const logChannel = client.channels.cache.get(BOT_LOG_CHANNEL_ID);
    if (!logChannel || !logChannel.guild) {
        console.warn('[threadActivityReport] BOT_LOG_CHANNEL_ID not found in cache — skipping report.');
        return;
    }

    let activeThreads;
    try {
        const fetched = await logChannel.guild.channels.fetchActiveThreads();
        activeThreads = [...fetched.threads.values()];
    } catch (err) {
        console.error('[threadActivityReport] Failed to fetch active threads:', err);
        return;
    }

    if (activeThreads.length === 0) {
        await logChannel.send('🧵 **Thread Activity Report** — no active threads right now.');
        return;
    }

    const activeCutoff = Date.now() - THREE_DAYS_MS;
    const staleCutoff = Date.now() - SEVEN_DAYS_MS;
    const stillActive = [];
    const wentSilent = [];
    let goneStaleCount = 0;

    for (const thread of activeThreads) {
        const lastActive = lastActivityTimestamp(thread);
        if (lastActive >= activeCutoff) stillActive.push(thread);
        else if (lastActive >= staleCutoff) wentSilent.push(thread);
        else goneStaleCount++;
    }

    stillActive.sort((a, b) => lastActivityTimestamp(b) - lastActivityTimestamp(a));
    wentSilent.sort((a, b) => lastActivityTimestamp(b) - lastActivityTimestamp(a));

    const sections = [];

    sections.push(`🧵 **Thread Activity Report** — ${activeThreads.length} active thread(s) total.`);

    sections.push(`\n**✅ Active in the last 3 days (${stillActive.length}):**`);
    sections.push(...(stillActive.length ? withBlankLines(stillActive.map(formatThreadLine)) : ['*None.*']));

    sections.push(`\n**💤 Went silent — 3 to 7 days inactive (${wentSilent.length}):**`);
    sections.push(...(wentSilent.length ? withBlankLines(wentSilent.map(formatThreadLine)) : ['*None.*']));

    sections.push(`\n🗑 ${goneStaleCount} thread(s) inactive 7+ days — not shown.`);

    for (const chunk of chunkLines(sections)) {
        await logChannel.send(chunk);
    }
}

function init(client) {
    client.once('clientReady', () => {
        scheduleFromStore(client);
        console.log('[threadActivityReport] Started - reports every 3 days.');
    });
}

async function runAndReschedule(client) {
    try {
        await runThreadActivityReport(client);
    } catch (err) {
        console.error('[threadActivityReport] Report error:', err);
    }
    const nextDue = Date.now() + THREE_DAYS_MS;
    store.save({ nextReportDue: nextDue });
    setTimeout(() => runAndReschedule(client), THREE_DAYS_MS);
}

function scheduleFromStore(client) {
    const data = store.load();
    const now = Date.now();

    if (!data.nextReportDue) {
        store.save({ nextReportDue: now + THREE_DAYS_MS });
        setTimeout(() => runAndReschedule(client), THREE_DAYS_MS);
        return;
    }

    if (now >= data.nextReportDue) {
        console.log('[threadActivityReport] Report was due while offline — sending catch-up report now.');
        runAndReschedule(client);
        return;
    }

    const remainingMs = data.nextReportDue - now;
    setTimeout(() => runAndReschedule(client), remainingMs);
}

module.exports = { init, runThreadActivityReport };
