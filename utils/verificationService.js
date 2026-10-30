const { PermissionFlagsBits } = require('discord.js');
const store = require('./verificationStore');
const log = require('./verificationLog');
const { getConfig } = require('../config/verificationConfig');
const { reportError } = require('./errorReporter');

const DAY_MS = 24 * 60 * 60 * 1000;

const CLANKERS_ROLE_ID = process.env.CLANKERS_ROLE_ID || null;
const STAFF_ROLE_IDS = [process.env.ADMINS_ROLE_ID, process.env.HR_ROLE_ID].filter(Boolean);

// ─── Who is exempt from the deadline ────────────────────────────────────────
function hasAdventurer(member) {
    const { adventurerRoleId } = getConfig();
    return !!adventurerRoleId && member.roles.cache.has(adventurerRoleId);
}

function isExempt(member) {
    if (member.user.bot) return true;
    if (hasAdventurer(member)) return true;
    if (CLANKERS_ROLE_ID && member.roles.cache.has(CLANKERS_ROLE_ID)) return true;
    return STAFF_ROLE_IDS.some(id => member.roles.cache.has(id));
}

// ─── Deadline maths ─────────────────────────────────────────────────────────
function deadlineOf(entry, cfg = getConfig()) {
    return entry.trackedSince + (cfg.deadlineDays + (entry.extraDays || 0)) * DAY_MS;
}

const reminderDueAt = (deadline, n) => deadline - n * DAY_MS;

// ─── Tracking ───────────────────────────────────────────────────────────────
function startTracking(userId, trackedSince = Date.now()) {
    store.update(userId, e => {
        e.trackedSince = trackedSince;
        e.extraDays = 0;
        e.remindersSent = [];
        e.dryReminders = [];
        e.dryKickLogged = false;
        e.skipLogged = false;
    });
}

function clearAll(userId) {
    store.remove(userId);
}

// ─── Granting the role ──────────────────────────────────────────────────────
async function grantAdventurer(member, reason) {
    const { adventurerRoleId } = getConfig();
    if (!adventurerRoleId) return { ok: false, reason: 'Adventurer role is not configured.' };
    try {
        await member.roles.add(adventurerRoleId, reason);
    } catch (err) {
        return { ok: false, reason: err.message };
    }
    clearAll(member.id);
    return { ok: true };
}

// ─── Deadline sweep (reminders + kicks) ─────────────────────────────────────
let lastSweepAt = 0;
let warnedNoKickPerm = false;
const SWEEP_EVERY_MS = 30 * 60 * 1000;

function requestSweep() {
    lastSweepAt = 0;
}

function sweepDue(now = Date.now()) {
    return now - lastSweepAt >= SWEEP_EVERY_MS;
}

async function dm(user, content) {
    try {
        await user.send({ content, allowedMentions: { parse: [] } });
        return true;
    } catch {
        return false;
    }
}

function reminderText(guild, cfg, daysLeft, deadline) {
    const where = cfg.dashboardChannelId ? ` in <#${cfg.dashboardChannelId}>` : '';
    return [
        `👋 Hi from **${guild.name}**! You haven't verified yet.`,
        `You have **${daysLeft} day${daysLeft === 1 ? '' : 's'}** left (deadline <t:${Math.floor(deadline / 1000)}:F>).`,
        `Head to the verification channel${where} and press **Start Verification**. It takes under a minute.`,
        `If you don't verify in time you'll be removed from the server, but you're always welcome to rejoin.`,
    ].join('\n');
}

function kickText(guild, cfg, days) {
    return [
        `👢 You were removed from **${guild.name}** because you didn't verify within ${days} day${days === 1 ? '' : 's'}.`,
        `This isn't a ban. You're welcome to rejoin the server whenever you like.`,
        `After rejoining, press **Start Verification** in the verification channel to get access.`,
    ].join('\n');
}

async function runDeadlineSweep(client) {
    const cfg = getConfig();
    if (cfg.cleanupMode === 'disabled') return;
    if (!cfg.adventurerRoleId) return;

    const guild = client.guilds.cache.get(process.env.GUILD_ID) ?? client.guilds.cache.first();
    if (!guild) return;

    lastSweepAt = Date.now();
    const live = cfg.cleanupMode === 'enabled';

    if (live && !guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers)) {
        if (!warnedNoKickPerm) {
            warnedNoKickPerm = true;
            await reportError(client, { scope: '[verification]', message: 'Cleanup is enabled but the bot lacks Kick Members. Sweep skipped.' });
        }
        return;
    }
    warnedNoKickPerm = false;

    let members;
    try {
        members = await guild.members.fetch();
    } catch (err) {
        await reportError(client, { scope: '[verification]', message: 'Could not fetch members for the deadline sweep', error: err });
        return;
    }

    const seedFrom = cfg.cleanupEnabledAt ?? Date.now();
    store.mutate(users => {
        for (const member of members.values()) {
            const entry = users[member.id];
            if (isExempt(member)) {
                if (entry?.trackedSince) {
                    if (entry.lockedUntil > Date.now()) users[member.id] = { lockedUntil: entry.lockedUntil, attemptsUsed: entry.attemptsUsed || 0 };
                    else delete users[member.id];
                }
                continue;
            }
            if (!entry?.trackedSince) {
                const since = Math.max(member.joinedTimestamp ?? Date.now(), seedFrom);
                users[member.id] = {
                    ...(entry || {}),
                    trackedSince: since, extraDays: 0,
                    remindersSent: [], dryReminders: [], dryKickLogged: false, skipLogged: false,
                };
            }
        }
        for (const [id, entry] of Object.entries(users)) {
            if (entry.trackedSince && !members.has(id)) {
                if (entry.lockedUntil > Date.now()) users[id] = { lockedUntil: entry.lockedUntil, attemptsUsed: entry.attemptsUsed || 0 };
                else delete users[id];
            }
        }
    });

    const now = Date.now();
    for (const [userId, entry] of Object.entries(store.all())) {
        if (!entry.trackedSince) continue;
        const member = members.get(userId);
        if (!member) continue;

        const deadline = deadlineOf(entry, cfg);
        const user = member.user;

        if (now >= deadline) {
            if (!member.kickable) {
                if (!entry.skipLogged) {
                    store.update(userId, e => { e.skipLogged = true; });
                    await log.skipped(client, user, 'The bot cannot kick this member (they sit above the bot, are the owner, or Kick Members is missing).');
                }
                continue;
            }
            if (!live) {
                if (!entry.dryKickLogged) {
                    store.update(userId, e => { e.dryKickLogged = true; });
                    await log.dryKicked(client, user, { days: cfg.deadlineDays + (entry.extraDays || 0) });
                }
                continue;
            }
            const days = cfg.deadlineDays + (entry.extraDays || 0);
            const dmDelivered = await dm(user, kickText(guild, cfg, days));
            try {
                await member.kick(`Did not verify within ${days} days`);
            } catch (err) {
                await reportError(client, { scope: '[verification]', message: `Failed to kick ${user.tag}`, error: err });
                continue;
            }
            store.clearKeepingLock(userId);
            await log.kicked(client, user, { days, dmDelivered });
            continue;
        }

        const sentKey = live ? 'remindersSent' : 'dryReminders';
        const sent = (entry[sentKey] || []).filter(n => reminderDueAt(deadline, n) <= now);
        const due = cfg.reminderDays.filter(n => reminderDueAt(deadline, n) <= now && !sent.includes(n));
        if (due.length === 0) {
            if (sent.length !== (entry[sentKey] || []).length) store.update(userId, e => { e[sentKey] = sent; });
            continue;
        }
        const daysLeft = Math.min(...due);
        store.update(userId, e => { e[sentKey] = [...new Set([...sent, ...due])]; });

        if (!live) {
            await log.dryReminded(client, user, { daysLeft, deadline });
            continue;
        }
        const delivered = await dm(user, reminderText(guild, cfg, daysLeft, deadline));
        await log.reminded(client, user, { daysLeft, delivered, deadline });
    }
}

module.exports = {
    DAY_MS, isExempt, hasAdventurer, deadlineOf, reminderDueAt,
    startTracking, clearAll, grantAdventurer,
    runDeadlineSweep, requestSweep, sweepDue,
};
