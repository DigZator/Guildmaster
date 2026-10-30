const { getCachedGames, invalidateCache } = require('./cache');
const { getQueue, claimRunForDate, releaseRunForDate, claimReminderForDate, completeQueueEntries, getLastRunDate } = require('./activationQueue');
const { updateGameProperties } = require('./notion');
const { reportError } = require('./errorReporter');
const { istDateStr, istTimeOnDayMs, toDiscordTimestamp, crossedDailyTime } = require('./istTime');
const { QUEST_BOARD_CHANNEL_ID, GUILDMASTER_CTRL_CHANNEL_ID, BOT_DEBUGGING_CHANNEL_ID } = require('../data/channels');

const QUEST_BOARD_ID = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : QUEST_BOARD_CHANNEL_ID;
const { DEFAULT_REGISTRATION_LINK } = require('../data/registrationDefaults');
const { getRoleMention } = require('./announcementHelper');

const ACTIVATION_MAX_ATTEMPTS = 2;                      // the first run plus one retry
const ACTIVATION_RETRY_DELAY_MS = 10 * 60 * 1000;

let ctrlChannel = null;
let botClient = null;
let schedulerInterval = null;
let lastTickMs = null;
let retryTimer = null;

async function sendToCtrl(payload, what) {
    try {
        await ctrlChannel.send(payload);
        return true;
    } catch (e) {
        console.error(`[Scheduler] Could not post ${what} to the control channel:`, e);
        return false;
    }
}

async function runReminderJob() {
    const data = getQueue();
    if (!data.reminderEnabled) return;
    if (!ctrlChannel) {
        console.warn('[Scheduler] Control channel not found — skipping reminder.');
        return;
    }

    const games = await getCachedGames();
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const qualifying = games.filter(g => !g.activate && new Date(g.createdTime).getTime() > threeDaysAgo);

    const queuedUids = data.queue.map(g => g.uid);
    const activationTs = toDiscordTimestamp(data.activationTime);

    let msg = `📋 **Daily Activation Reminder**\n\n`;

    if (qualifying.length === 0) {
        msg += `No recently created games pending activation.\n`;
    } else {
        msg += `**Recently created games pending activation:**\n`;
        qualifying.forEach(g => {
            const queued = queuedUids.includes(g.uid) ? ' ✅ queued' : '';
            msg += `- **${g.title}** | ${g.date} | DM: ${g.dm} | ${g.system}${queued}\n`;
        });
    }

    if (data.queue.length > 0) {
        msg += `\n**Scheduled for activation at <t:${activationTs}:t>:**\n`;
        data.queue.forEach(g => {
            msg += `- **${g.title}** — added by <@${g.addedBy}> <t:${g.addedAt}:R>\n`;
        });
    } else {
        msg += `\nNo games currently scheduled for activation.\n`;
    }

    msg += `\nUse \`/schedule_activation add\` to schedule games.`;

    await ctrlChannel.send({ content: msg, allowedMentions: { parse: [] } });
}

function buildQuestBoardMessage(games, guild) {
    const roleIds = new Set();
    const lines = games.map(g => {
        const mention = guild ? getRoleMention(g, guild) : '';
        const roleId = mention.match(/^<@&(\d+)>$/)?.[1];
        if (roleId) roleIds.add(roleId);
        return `- ${g.title}${mention ? ` ${mention}` : ''}`;
    });
    const content = `‼️ **Registrations for the following game/s are now live** ‼️\n\n${lines.join('\n')}\n\nRegistration Link - ${DEFAULT_REGISTRATION_LINK}`;
    return { content, roleIds: [...roleIds] };
}

function shortReason(err) {
    return String(err?.message ?? err).slice(0, 150);
}

function scheduleActivationRetry({ attempt, cutoffMs }) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
        retryTimer = null;
        runActivationJob({ attempt, cutoffMs }).catch(e => reportError(botClient, { scope: '[Scheduler]', message: 'Activation retry crashed', error: e }));
    }, ACTIVATION_RETRY_DELAY_MS);
}

async function runActivationJob({ force = false, attempt = 1, cutoffMs = null, announce = true } = {}) {
    const startedAt = Date.now();
    const data = getQueue();
    const entries = cutoffMs ? data.queue.filter(e => e.addedAt * 1000 <= cutoffMs) : [...data.queue];
    if (entries.length === 0) return { ran: false, reason: 'empty' };

    if (!ctrlChannel) {
        console.warn('[Scheduler] Control channel not found — activation job not run.');
        return { ran: false, reason: 'no_ctrl_channel' };
    }

    const today = istDateStr();
    const previousRunDate = getLastRunDate();
    if (!force && !claimRunForDate(today)) {
        console.log('[Scheduler] Activation job already ran today — skipping (use force to override).');
        return { ran: false, reason: 'already_ran' };
    }

    const results = { skipped: [], processed: [], failed: [] };

    let games = null;
    try {
        games = await getCachedGames();
    } catch (e) {
        await reportError(botClient, {
            scope: '[Scheduler]',
            message: 'Could not load games for the activation job',
            error: e,
            context: { attempt }
        });
        for (const entry of entries) {
            results.failed.push({ entry, reason: `couldn't load games from Notion (${shortReason(e)})`, retryable: true });
        }
    }

    if (games) {
        for (const entry of entries) {
            const game = games.find(g => g.uid === entry.uid);
            if (!game) {
                results.failed.push({ entry, reason: 'not found in Notion — it may have been deleted', retryable: false });
                continue;
            }
            if (game.activate) {
                results.skipped.push(game);
                continue;
            }
            try {
                await updateGameProperties(entry.uid, { "Activate": { checkbox: true } });
                invalidateCache();
                results.processed.push(game);
            } catch (e) {
                await reportError(botClient, {
                    scope: '[Scheduler]',
                    message: `Failed to activate ${entry.title}`,
                    error: e,
                    context: { gameUid: entry.uid, gameTitle: entry.title }
                });
                results.failed.push({ entry, reason: shortReason(e), retryable: true });
            }
        }
    }

    const handledUids = [...results.processed, ...results.skipped].map(g => g.uid);
    if (handledUids.length) completeQueueEntries(handledUids);

    const willRetry = !force && attempt < ACTIVATION_MAX_ATTEMPTS && results.failed.some(f => f.retryable);
    if (willRetry) {
        releaseRunForDate(today, previousRunDate);
        scheduleActivationRetry({ attempt: attempt + 1, cutoffMs: cutoffMs ?? startedAt });
    }

    const ts = Math.floor(Date.now() / 1000);
    let msg = `⚡ **Activation Job ran at <t:${ts}:t>**\n\n`;

    if (results.processed.length) msg += `**Activated:**\n${results.processed.map(g => `- ${g.title}`).join('\n')}\n\n`;
    if (results.skipped.length) msg += `**Already active (skipped):**\n${results.skipped.map(g => `- ${g.title}`).join('\n')}\n\n`;
    if (results.failed.length) msg += `**Failed:**\n${results.failed.map(f => `- ${f.entry.title}`).join('\n')}\n\n`;
    if (!announce && results.processed.length) msg += `🔕 _Announcement skipped (run with announce: false) — no WhatsApp copy or quest-board post was made._\n\n`;

    await sendToCtrl({ content: msg, allowedMentions: { parse: [] } }, 'the activation summary');

    if (results.failed.length) {
        const next = willRetry
            ? `Retrying automatically in ${ACTIVATION_RETRY_DELAY_MS / 60000} minutes (attempt ${attempt + 1} of ${ACTIVATION_MAX_ATTEMPTS}).`
            : 'No more automatic retries for now. Fix the cause, then use `/schedule_activation run-now`, or `/schedule_activation remove` to drop an entry.';
        const lines = results.failed.map(f => `- **${f.entry.title}** — ${f.reason}`).join('\n');
        await sendToCtrl({
            content: `🚨 **Activation needs attention** — ${results.failed.length} game${results.failed.length === 1 ? '' : 's'} could not be activated and ${results.failed.length === 1 ? 'is' : 'are'} still in the queue:\n${lines}\n\n${next}`,
            allowedMentions: { parse: [] }
        }, 'the activation alert');
    }

    if (announce && results.processed.length) {
        const waTitleList = results.processed.map(g => `- ${g.title} (${g.format} ${g.type})`).join(`\n`);
        const waMsg = `‼️ *Registrations for the following game/s are now live* ‼️\n\n${waTitleList}\n\nRegistration Link - ${DEFAULT_REGISTRATION_LINK}`;

        await sendToCtrl(`📋 **WhatsApp copy:**\n\`\`\`\n${waMsg}\n\`\`\``, 'the WhatsApp copy');

        const questChannel = ctrlChannel.guild.channels.cache.get(QUEST_BOARD_ID);
        const { content, roleIds } = buildQuestBoardMessage(results.processed, ctrlChannel.guild);
        let boardProblem = null;

        if (!questChannel) {
            boardProblem = 'the quest-board channel could not be found';
        } else {
            try {
                await questChannel.send({ content, allowedMentions: { roles: roleIds } });
            } catch (e) {
                boardProblem = shortReason(e);
                await reportError(botClient, {
                    scope: '[Scheduler]',
                    message: 'Games were activated but the quest-board announcement failed',
                    error: e,
                    context: { games: results.processed.map(g => g.title).join(', ') }
                });
            }
        }

        if (boardProblem) {
            await sendToCtrl({
                content: `🚨 **The games above are live in Notion, but the quest-board announcement was NOT posted** (${boardProblem}). Please post this by hand:\n\`\`\`\n${content.slice(0, 1700)}\n\`\`\``,
                allowedMentions: { parse: [] }
            }, 'the announcement-failed alert');
        }
    }

    return {
        ran: true,
        activated: results.processed.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
        announced: announce && results.processed.length > 0
    };
}

function tick() {
    const data = getQueue();
    const nowMs = Date.now();

    if (lastTickMs !== null) {
        if (crossedDailyTime(data.reminderTime, lastTickMs, nowMs) && claimReminderForDate(istDateStr(nowMs))) {
            runReminderJob().catch(e => reportError(botClient, { scope: '[Scheduler]', message: 'Reminder job crashed', error: e }));
        }
        if (crossedDailyTime(data.activationTime, lastTickMs, nowMs)) {
            runActivationJob().catch(e => reportError(botClient, { scope: '[Scheduler]', message: 'Activation job crashed', error: e }));
        }
    }

    lastTickMs = nowMs;
}

async function runStartupCheck(client) {
    botClient = client;
    const ctrlChannelId = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : GUILDMASTER_CTRL_CHANNEL_ID;
    ctrlChannel = client.channels.cache.get(ctrlChannelId);
    if (!ctrlChannel) {
        console.warn('[Scheduler] Control channel not found.');
        return;
    }

    const data = getQueue();
    if (data.queue.length === 0) return;

    const now = Date.now();
    const activateAtMs = istTimeOnDayMs(data.activationTime, now);

    if (now >= activateAtMs) {
        if (getLastRunDate() === istDateStr(now)) {
            console.log('[Scheduler] Past activation time, but activation already ran today — not re-running on startup.');
            return;
        }

        const due = data.queue.filter(e => e.addedAt * 1000 <= activateAtMs);
        if (due.length === 0) {
            console.log('[Scheduler] Queue only holds games added after today\'s activation time — waiting for the next run.');
            return;
        }

        console.log('[Scheduler] Past activation time with queued games — running activation job on startup.');
        await sendToCtrl(`🔄 **Bot restarted past activation time** — running activation job now.`, 'the restart notice');
        await runActivationJob({ cutoffMs: activateAtMs });
    }
}

function init(client) {
    client.once('clientReady', async () => {
        await runStartupCheck(client);
        schedulerInterval = setInterval(tick, 60 * 1000);
        console.log('[Scheduler] Started.');
    });
}

module.exports = { init, runActivationJob, buildQuestBoardMessage };
