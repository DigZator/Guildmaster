const { isAdminChannel } = require('../utils/isAdminChannel');
const { getCachedGames } = require('../utils/cache');
const {
    getQueue,
    addToQueue,
    removeFromQueue,
    setReminderTime,
    setActivationTime,
    toggleReminder
} = require('../utils/activationQueue');

function toDiscordTimestamp(timeStr) {
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const [h, m] = timeStr.split(':').map(Number);
    ist.setHours(h, m, 0, 0);
    return Math.floor(ist.getTime() / 1000);
}

function isValidTime(str) {
    return /^\d{2}:\d{2}$/.test(str) && str.split(':')[0] < 24 && str.split(':')[1] < 60;
}

function buildQueueSummary(data) {
    const reminderTs = toDiscordTimestamp(data.reminderTime);
    const activationTs = toDiscordTimestamp(data.activationTime);
    const reminderStatus = data.reminderEnabled ? '✅ Enabled' : '❌ Disabled';

    let msg = `**Activation Queue Status**\n`;
    msg += `Reminder: <t:${reminderTs}:t> — ${reminderStatus}\n`;
    msg += `Activation: <t:${activationTs}:t>\n\n`;

    if (data.queue.length === 0) {
        msg += `Queue is empty.`;
    } else {
        msg += `**Queued Games:**\n`;
        data.queue.forEach(g => {
            msg += `- **${g.title}** — added by <@${g.addedBy}> <t:${g.addedAt}:R>\n`;
        });
    }
    return msg;
}

module.exports = async (interaction, client) => {
    if (!isAdminChannel(interaction)) {
        await interaction.reply({ content: '❌ This command can only be used in mod channels.', flags: 64 });
        return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
        const uid = interaction.options.getString('game');
        const games = await getCachedGames();
        const game = games.find(g => g.uid === uid);

        if (!game) {
            await interaction.reply({ content: '❌ Game not found.', flags: 64 });
            return;
        }

        const data = getQueue();
        const activationTs = toDiscordTimestamp(data.activationTime);
        const now = new Date();
        const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const currentMinutes = ist.getHours() * 60 + ist.getMinutes();
		const [ah, am] = data.activationTime.split(':').map(Number);
        const activationMinutes = ah * 60 + am;
        
        const added = addToQueue(game, interaction.user.id);

        if (!added) {
            await interaction.reply({ content: `⚠️ **${game.title}** is already in the queue.`, flags: 64 });
            return;
        }

        let reply = `✅ **${game.title}** added to the activation queue.\n`;
        if (currentMinutes > activationMinutes) {
            reply += `⚠️ Current time is past the activation time <t:${activationTs}:t>. The game is queued but will activate on the next run.\n\n`;
        }
        reply += `\n${buildQueueSummary(getQueue())}`;

        await interaction.reply({ content: reply, flags: 64 });
    }

    else if (sub === 'remove') {
        const uid = interaction.options.getString('game');
        const data = getQueue();
        const entry = data.queue.find(g => g.uid === uid);

        if (!entry) {
            await interaction.reply({ content: '❌ Game not found in queue.', flags: 64 });
            return;
        }

        removeFromQueue(uid);
        let reply = `✅ **${entry.title}** removed from the queue.\n\n`;
        reply += buildQueueSummary(getQueue());
        await interaction.reply({ content: reply, flags: 64 });
    }

    else if (sub === 'view') {
        await interaction.reply({ content: buildQueueSummary(getQueue()), flags: 64 });
    }

    else if (sub === 'set-reminder-time') {
        const time = interaction.options.getString('time');
        if (!isValidTime(time)) {
            await interaction.reply({ content: '❌ Invalid time format. Use HH:MM in 24hr IST.', flags: 64 });
            return;
        }
        setReminderTime(time);
        const ts = toDiscordTimestamp(time);
        await interaction.reply({ content: `✅ Reminder time updated to <t:${ts}:t>.`, flags: 64 });
    }

    else if (sub === 'set-activation-time') {
        const time = interaction.options.getString('time');
        if (!isValidTime(time)) {
            await interaction.reply({ content: '❌ Invalid time format. Use HH:MM in 24hr IST.', flags: 64 });
            return;
        }
        setActivationTime(time);
        const ts = toDiscordTimestamp(time);
        await interaction.reply({ content: `✅ Activation time updated to <t:${ts}:t>.`, flags: 64 });
    }

    else if (sub === 'toggle-reminder') {
        const enabled = toggleReminder();
        await interaction.reply({
            content: `✅ Daily reminder is now **${enabled ? 'enabled' : 'disabled'}**.`,
            flags: 64
        });
    }

    else if (sub === 'status') {
        await interaction.reply({ content: buildQueueSummary(getQueue()), flags: 64 });
    }
};
