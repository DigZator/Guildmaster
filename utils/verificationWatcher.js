const store = require('./verificationStore');
const log = require('./verificationLog');
const service = require('./verificationService');
const { getConfig, setConfig } = require('../config/verificationConfig');
const { reportError } = require('./errorReporter');

const TICK_MS = 60 * 1000;
let busy = false;

function getGuild(client) {
    return client.guilds.cache.get(process.env.GUILD_ID) ?? client.guilds.cache.first();
}

async function checkDashboard(client) {
    const cfg = getConfig();
    if (!cfg.dashboardChannelId || !cfg.dashboardMessageId) return;
    try {
        const channel = await client.channels.fetch(cfg.dashboardChannelId);
        await channel.messages.fetch(cfg.dashboardMessageId);
    } catch (err) {
        console.warn(
            `[verificationWatcher] Stored verification dashboard message is missing (channel ${cfg.dashboardChannelId}, message ${cfg.dashboardMessageId}). ` +
            'An admin needs to run /verification setup again to repost it.',
            err.message,
        );
        setConfig({ dashboardMessageId: null });
    }
}

async function sweepAbandoned(client) {
    const cfg = getConfig();
    const now = Date.now();
    const lapsed = [];

    store.mutate(users => {
        let changed = false;
        for (const [id, e] of Object.entries(users)) {
            if (e.lockedUntil && e.lockedUntil <= now && !e.currentAnswer && !e.sessionStartedAt) {
                // Lockout over and nothing else in progress: reset attempts.
                e.lockedUntil = null;
                e.attemptsUsed = 0;
                changed = true;
            }
            if (!e.sessionStartedAt || e.lockedUntil > now) continue;
            if (!(e.questionExpiresAt && e.questionExpiresAt < now) || e.abandonLogged) continue;

            lapsed.push({ id, attempts: e.attemptsUsed || 0 });
            e.abandonLogged = true;
            e.currentAnswer = null;
            e.sessionStartedAt = null;
            changed = true;
        }
        for (const [id, e] of Object.entries(users)) {
            if (store.isEmpty(e)) { delete users[id]; changed = true; }
        }
        return changed ? undefined : false;
    });

    for (const { id, attempts } of lapsed) {
        const user = await client.users.fetch(id).catch(() => ({ id, tag: id }));
        await log.abandoned(client, user, { attempts, max: cfg.maxAttempts });
    }
}

async function tick(client) {
    if (busy) return;
    busy = true;
    try {
        await sweepAbandoned(client);
        if (service.sweepDue()) await service.runDeadlineSweep(client);
    } catch (err) {
        await reportError(client, { scope: '[verificationWatcher]', message: 'Tick failed', error: err });
    } finally {
        busy = false;
    }
}

function init(client) {
    client.setMaxListeners(client.getMaxListeners() + 1);

    client.once('clientReady', async () => {
        await checkDashboard(client);
        const timer = setInterval(() => tick(client), TICK_MS);
        if (timer.unref) timer.unref();
        console.log('[verificationWatcher] Started.');
    });

    client.on('guildMemberAdd', member => {
        try {
            const cfg = getConfig();
            if (cfg.cleanupMode === 'disabled' || !cfg.adventurerRoleId) return;
            if (service.isExempt(member)) return;
            service.startTracking(member.id);
        } catch (err) {
            console.error('[verificationWatcher] guildMemberAdd failed:', err.message);
        }
    });

    client.on('guildMemberRemove', member => {
        try {
            store.clearKeepingLock(member.id);
        } catch (err) {
            console.error('[verificationWatcher] guildMemberRemove failed:', err.message);
        }
    });

    client.on('guildMemberUpdate', (oldMember, newMember) => {
        try {
            const { adventurerRoleId } = getConfig();
            if (!adventurerRoleId) return;
            if (!oldMember.roles.cache.has(adventurerRoleId) && newMember.roles.cache.has(adventurerRoleId)) {
                service.clearAll(newMember.id);
            }
        } catch (err) {
            console.error('[verificationWatcher] guildMemberUpdate failed:', err.message);
        }
    });
}

module.exports = { init };
