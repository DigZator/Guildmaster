const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('../config/verificationConfig');

const COLORS = {
    pass: 0x57f287,
    fail: 0xed4245,
    warn: 0xfee75c,
    info: 0x5865f2,
    dry: 0x99aab5,
};

const ts = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;
const who = user => `<@${user.id}> (${user.tag ?? user.username ?? user.id})`;

async function post(client, { title, color = COLORS.info, description, fields = [] }) {
    const { logChannelId } = getConfig();
    if (!logChannelId) {
        console.warn('[verificationLog] No log channel configured; skipping log:', title);
        return false;
    }
    try {
        const channel = await client.channels.fetch(logChannelId);
        const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
        if (description) embed.setDescription(description);
        if (fields.length) embed.addFields(fields);
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        return true;
    } catch (err) {
        console.error('[verificationLog] Failed to post log:', err.message);
        return false;
    }
}

const dur = ms => {
    const s = Math.max(1, Math.round(ms / 1000));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

module.exports = {
    COLORS, ts, who, dur, post,

    passed: (client, user, { attempts, max, tookMs }) => post(client, {
        title: '✅ Verification passed',
        color: COLORS.pass,
        description: `${who(user)} passed verification.`,
        fields: [
            { name: 'Attempts used', value: `${attempts} of ${max}`, inline: true },
            { name: 'Time taken', value: dur(tookMs), inline: true },
            { name: 'Consequence', value: 'Adventurer role granted.' },
        ],
    }),

    failed: (client, user, { max, lockoutMin, retryAt }) => post(client, {
        title: '❌ Verification failed',
        color: COLORS.fail,
        description: `${who(user)} used all ${max} attempts without a correct answer.`,
        fields: [
            { name: 'Consequence', value: `Locked out for ${lockoutMin} min. Can retry ${ts(retryAt)}.` },
        ],
    }),

    abandoned: (client, user, { attempts, max }) => post(client, {
        title: '⌛ Verification abandoned',
        color: COLORS.warn,
        description: `${who(user)} let their question time out.`,
        fields: [
            { name: 'Attempts used', value: `${attempts} of ${max}`, inline: true },
            { name: 'Consequence', value: 'None. Still unverified; they can start again.' },
        ],
    }),

    forced: (client, admin, target) => post(client, {
        title: '🛡️ Force verified',
        color: COLORS.info,
        description: `${who(admin)} force-verified ${who(target)}.`,
        fields: [{ name: 'Target type', value: target.bot ? 'Bot' : 'Human', inline: true }],
    }),

    extended: (client, admin, target, { days, newDeadline }) => post(client, {
        title: '⏱️ Deadline extended',
        color: COLORS.info,
        description: `${who(admin)} gave ${who(target)} **${days}** extra day(s).`,
        fields: [{ name: 'New deadline', value: `${ts(newDeadline, 'F')} (${ts(newDeadline)})` }],
    }),

    reminded: (client, user, { daysLeft, delivered, deadline }) => post(client, {
        title: delivered ? '📨 Verification reminder sent' : '📪 Verification reminder failed',
        color: delivered ? COLORS.info : COLORS.warn,
        description: `${who(user)} was ${delivered ? 'sent' : 'NOT sent (DMs closed)'} the **${daysLeft}-day** reminder.`,
        fields: [{ name: 'Deadline', value: ts(deadline, 'F') }],
    }),

    dryReminded: (client, user, { daysLeft, deadline }) => post(client, {
        title: '🧪 Dry run: would have reminded',
        color: COLORS.dry,
        description: `${who(user)} would have received the **${daysLeft}-day** reminder. No DM was sent.`,
        fields: [{ name: 'Deadline', value: ts(deadline, 'F') }],
    }),

    kicked: (client, user, { days, dmDelivered }) => post(client, {
        title: '👢 Kicked: did not verify',
        color: COLORS.fail,
        description: `${who(user)} did not verify within ${days} day(s) and was kicked.`,
        fields: [{ name: 'Rejoin DM', value: dmDelivered ? 'Delivered' : 'Failed (DMs closed)' }],
    }),

    dryKicked: (client, user, { days }) => post(client, {
        title: '🧪 Dry run: would have kicked',
        color: COLORS.dry,
        description: `${who(user)} did not verify within ${days} day(s). They would have been kicked. Nothing was done.`,
    }),

    skipped: (client, user, reason) => post(client, {
        title: '⚠️ Cleanup skipped a member',
        color: COLORS.warn,
        description: `${who(user)} is past a verification deadline but was skipped.`,
        fields: [{ name: 'Reason', value: reason }],
    }),
};
