const { getCachedGames, invalidateCache } = require('./cache');
const { getQueue, clearQueue } = require('./activationQueue');
const { updateGameProperties } = require('./notion');
const { QUEST_BOARD_CHANNEL_ID, GUILDMASTER_CTRL_CHANNEL_ID, BOT_DEBUGGING_CHANNEL_ID } = require('../data/channels');


const QUEST_BOARD_ID = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : QUEST_BOARD_CHANNEL_ID;
const REGISTRATION_LINK = 'https://adventuringguildmumbai.fillout.com/player-sign-up';

let ctrlChannel = null;
let schedulerInterval = null;
let lastTick = null;

function toISTMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function currentISTMinutes() {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return ist.getHours() * 60 + ist.getMinutes();
}

function toDiscordTimestamp(timeStr) {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const [h, m] = timeStr.split(':').map(Number);
    ist.setHours(h, m, 0, 0);
    return Math.floor(ist.getTime() / 1000);
}

async function runReminderJob() {
    const data = getQueue();
    if (!data.reminderEnabled) return;

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

    await ctrlChannel.send(msg);
}

async function runActivationJob() {
    const data = getQueue();
    if (data.queue.length === 0) return;

    const games = await getCachedGames();
    const results = { skipped: [], processed: [], failed: [] };

    for (const entry of data.queue) {
        const game = games.find(g => g.uid === entry.uid);
        if (!game) {
            results.failed.push(entry.title);
            continue;
        }
        if (game.activate) {
            results.skipped.push(entry.title);
            continue;
        }
        try {
            await updateGameProperties(entry.uid, { "Activate": { checkbox: true } });
            invalidateCache();
            results.processed.push(entry.title);
            // results.failed.push(entry.title);
        } catch (e) {
            console.error(`[Scheduler] Failed to activate ${entry.title}:`, e);
            results.failed.push(entry.title);
        }
    }

    clearQueue();

    const ts = Math.floor(Date.now() / 1000);
    let msg = `⚡ **Activation Job ran at <t:${ts}:t>**\n\n`;

    if (results.processed.length) msg += `**Activated:**\n${results.processed.map(t => `- ${t}`).join('\n')}\n\n`;
    if (results.skipped.length) msg += `**Already active (skipped):**\n${results.skipped.map(t => `- ${t}`).join('\n')}\n\n`;
    if (results.failed.length) msg += `**Failed:**\n${results.failed.map(t => `- ${t}`).join('\n')}\n\n`;

    const questChannel = ctrlChannel.guild.channels.cache.get(QUEST_BOARD_ID);

    await ctrlChannel.send(msg);
    if (results.processed.length) {
    	const titleList = results.processed.map(t => `- ${t}`).join(`\n`);

    	const questMsg = `‼️ **Registrations for the following game/s are now live** ‼️\n\n${titleList}\n\nRegistration Link - ${REGISTRATION_LINK}`;
    	const waMsg = `‼️ *Registrations for the following game/s are now live* ‼️\n\n${titleList}\n\nRegistration Link - ${REGISTRATION_LINK}`;

    	if (questChannel) await questChannel.send(questMsg);
    	await ctrlChannel.send(`📋 **WhatsApp copy:**\n\`\`\`\n${waMsg}\n\`\`\``);
    }	
}

function tick() {
    const data = getQueue();
    const now = currentISTMinutes();

    if (lastTick !== null){
	    const reminderAt = toISTMinutes(data.reminderTime);
	    const activateAt = toISTMinutes(data.activationTime);
	    if (timeInWindow(reminderAt, lastTick, now)) runReminderJob().catch(e => console.error('[Scheduler] Reminder error:', e));
	    if (timeInWindow(activateAt, lastTick, now)) runActivationJob().catch(e => console.error('[Scheduler] Activation error:', e));
    }

    lastTick = now;
}

function timeInWindow(target, last, now) {
	if (last<now) return target > last && target <= now;
	return target > last || target <= now;
}

async function runStartupCheck(client) {
    const ctrlChannelId = process.env.DEV_MODE === 'true' ? BOT_DEBUGGING_CHANNEL_ID : GUILDMASTER_CTRL_CHANNEL_ID;
    ctrlChannel = client.channels.cache.get(ctrlChannelId);
    if (!ctrlChannel) {
        console.warn('[Scheduler] Control channel not found.');
        return;
    }

    const data = getQueue();
    if (data.queue.length === 0) return;

    const now = currentISTMinutes();
    const activateAt = toISTMinutes(data.activationTime);

    if (now >= activateAt) {
        console.log('[Scheduler] Past activation time with queued games — running activation job on startup.');
        await ctrlChannel.send(`🔄 **Bot restarted past activation time** — running activation job now.`);
        await runActivationJob();
    }
}

function init(client) {
    client.once('clientReady', async () => {
        await runStartupCheck(client);
        schedulerInterval = setInterval(tick, 60 * 1000);
        console.log('[Scheduler] Started.');
    });
}

module.exports = { init };
