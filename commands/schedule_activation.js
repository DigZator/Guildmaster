const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { getCachedGames } = require('../utils/cache');
const {
    getQueue,
    addToQueue,
    removeFromQueue,
    setReminderTime,
    setActivationTime,
    toggleReminder,
    toggleAutoSchedule
} = require('../utils/activationQueue');
const { runActivationJob } = require('../utils/scheduler');
const { toDiscordTimestamp, istMinutesOfDay, parseTimeToMinutes } = require('../utils/istTime');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

function isValidTime(str) {
    return /^\d{2}:\d{2}$/.test(str) && str.split(':')[0] < 24 && str.split(':')[1] < 60;
}

function buildQueueSummary(data) {
    const reminderTs = toDiscordTimestamp(data.reminderTime);
    const activationTs = toDiscordTimestamp(data.activationTime);
    const reminderStatus = data.reminderEnabled ? '✅ Enabled' : '❌ Disabled';
    const autoStatus = data.autoSchedule ? '✅ Enabled' : '❌ Disabled';
        

    let msg = `**Activation Queue Status**\n`;
    msg += `Reminder: <t:${reminderTs}:t> — ${reminderStatus}\n`;
    msg += `Activation: <t:${activationTs}:t>\n`;
    msg += `Auto-schedule: ${autoStatus}\n\n`;

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
    if (!isAdminChannel(interaction, 'botChannelAdmin')) {
        await interaction.reply({ content: '❌ This command can only be used by admins in the mod channel.', flags: 64 });
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
        const currentMinutes = istMinutesOfDay();
        const activationMinutes = parseTimeToMinutes(data.activationTime);
        
        const added = addToQueue(game, interaction.user.id);

        if (added === 'custom_form') {
            await interaction.reply({ content: `⚠️ **${game.title}** has a custom registration form and cannot be added to the activation scheduler.`, flags: 64 });
            return;
        }

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

        const ctrlChannel = GUILDMASTER_CTRL_CHANNEL_ID ? interaction.guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID) : null;
        if (ctrlChannel) {
            await ctrlChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x5865f2)
                        .setTitle('📅 Game Added to Activation Schedule')
                        .addFields(
                            { name: 'Game',    value: game.title,                      inline: true },
                            { name: 'Added by', value: `<@${interaction.user.id}>`,    inline: true },
                            { name: 'Trigger', value: '/schedule_activation add',      inline: true },
                        )
                        .setTimestamp(),
                ],
            }).catch(e => console.error('[schedule_activation] Failed to post schedule log to guildmaster-ctrl:', e));
        }
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

    else if (sub === 'run-now') {
        const announce = interaction.options.getBoolean('announce') ?? true;
        const data = getQueue();
        if (data.queue.length === 0) {
            await interaction.reply({ content: '⚠️ Queue is empty — nothing to activate.', flags: 64 });
            return;
        }

        await interaction.reply({
            content: `🔄 Running activation job now (forced, ${announce ? 'with' : 'without'} announcement)...`,
            flags: 64
        });

        let outcome;
        try {
            outcome = await runActivationJob({ force: true, announce });
        } catch (e) {
            console.error('[schedule_activation] run-now failed:', e);
            await interaction.editReply({ content: `❌ Activation job crashed: ${String(e?.message ?? e).slice(0, 200)}` });
            return;
        }

        let result;
        if (!outcome?.ran) {
            result = outcome?.reason === 'no_ctrl_channel'
                ? '❌ Control channel not found — the activation job did not run.'
                : '⚠️ Nothing was run.';
        } else {
            result = `✅ Done — activated: **${outcome.activated}**, already active: **${outcome.skipped}**, failed: **${outcome.failed}**.\n`
                + (announce ? 'Announcement posted for any newly activated games.' : '🔕 Announcement skipped.')
                + '\nSee the control channel for the full summary.';
        }
        await interaction.editReply({ content: result });
    }

    else if (sub === 'toggle-auto') {
       const enabled = toggleAutoSchedule();
       await interaction.reply({
           content: `✅ Auto-scheduler  is now **${enabled ? 'enabled' : 'disabled'}**.`,
           flags: 64
       });
   }
};
