const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/verificationStore');
const log = require('../utils/verificationLog');
const service = require('../utils/verificationService');
const { getConfig, setConfig, BOUNDS } = require('../config/verificationConfig');
const { isVerificationAdmin } = require('../utils/verificationAdmin');
const { buildPendingPage } = require('../utils/verificationPending');
const { START_ID } = require('../buttons/verification');

const EPHEMERAL = 64;
const deny = interaction => interaction.reply({ content: '❌ You don\'t have permission to run this.', flags: EPHEMERAL });

function buildDashboardEmbed(cfg = getConfig()) {
    return new EmbedBuilder()
        .setTitle('🛡️ Verification')
        .setColor(0x5865f2)
        .setDescription(
            'Press **Start Verification** and answer one quick maths question to get the Adventurer role.\n\n' +
            `• You get **${cfg.maxAttempts}** attempts. Each one is a different question.\n` +
            `• Each question has a **${cfg.questionTimeLimitMin} minute** time limit.\n` +
            `• Use up every attempt and you'll wait **${cfg.lockoutMin} minutes** before trying again.`,
        );
}

function buildDashboardRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(START_ID).setLabel('Start Verification').setEmoji('✅').setStyle(ButtonStyle.Success),
    );
}

async function refreshDashboard(guild) {
    const cfg = getConfig();
    if (!cfg.dashboardChannelId || !cfg.dashboardMessageId) return;
    try {
        const channel = await guild.channels.fetch(cfg.dashboardChannelId);
        const message = await channel.messages.fetch(cfg.dashboardMessageId);
        await message.edit({ embeds: [buildDashboardEmbed(cfg)], components: [buildDashboardRow()] });
    } catch (err) {
        console.warn('[verification] Could not refresh dashboard:', err.message);
    }
}

// ─── setup ──────────────────────────────────────────────────────────────────
async function handleSetup(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const role = interaction.options.getRole('role');
    const logChannel = interaction.options.getChannel('log_channel');

    const patch = {};
    if (role) patch.adventurerRoleId = role.id;
    if (logChannel) patch.logChannelId = logChannel.id;
    setConfig(patch);

    const cfg = getConfig();
    if (!cfg.adventurerRoleId) {
        return interaction.editReply({ content: '❌ No Adventurer role known. Pass `role` (or set `ADVENTURER_ROLE_ID`).' });
    }

    const guild = interaction.guild;
    const me = guild.members.me;
    const adventurer = guild.roles.cache.get(cfg.adventurerRoleId);
    const warnings = [];
    if (!adventurer) warnings.push('⚠️ The Adventurer role was not found in this server.');
    else if (adventurer.managed || adventurer.position >= me.roles.highest.position) {
        warnings.push('⚠️ My highest role is not above the Adventurer role, so I can\'t assign it. Move my role higher.');
    }
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) warnings.push('⚠️ I\'m missing **Manage Roles**.');
    if (!me.permissions.has(PermissionFlagsBits.KickMembers)) warnings.push('⚠️ I\'m missing **Kick Members** (needed for cleanup mode `enabled`).');
    if (!cfg.logChannelId) warnings.push('⚠️ No log channel set. Pass `log_channel` (or set `BOT_LOG_CHANNEL_ID`).');

    const needed = [
        ['ViewChannel', PermissionFlagsBits.ViewChannel],
        ['SendMessages', PermissionFlagsBits.SendMessages],
        ['EmbedLinks', PermissionFlagsBits.EmbedLinks],
    ];
    const chanPerms = channel.permissionsFor(me);
    const missing = needed.filter(([, flag]) => !chanPerms?.has(flag)).map(([name]) => name);
    if (missing.length) {
        return interaction.editReply({
            content: `❌ I can't post in ${channel}. In that channel's permissions, give my role: **${missing.join(', ')}**. Then run \`/verification setup\` again.\nNothing was posted or deleted.`,
                    });
    }

    // Remove the old dashboard (if any), then post a fresh one.
    if (cfg.dashboardChannelId && cfg.dashboardMessageId) {
        try {
            const oldChannel = await guild.channels.fetch(cfg.dashboardChannelId);
            const oldMessage = await oldChannel.messages.fetch(cfg.dashboardMessageId);
            await oldMessage.delete();
        } catch { /* already gone */ }
    }

    const message = await channel.send({ embeds: [buildDashboardEmbed(cfg)], components: [buildDashboardRow()] });
    setConfig({ dashboardChannelId: channel.id, dashboardMessageId: message.id });

    await interaction.editReply({
        content: [`✅ Verification dashboard posted in ${channel}.`, `Role: <@&${cfg.adventurerRoleId}> · Log: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'none'}`, ...warnings].join('\n'),
                allowedMentions: { parse: [] },
    });
}

// ─── settings ───────────────────────────────────────────────────────────────
function settingsEmbed(cfg) {
    return new EmbedBuilder()
        .setTitle('⚙️ Verification settings')
        .setColor(0x5865f2)
        .addFields(
            { name: 'Question time limit', value: `${cfg.questionTimeLimitMin} min`, inline: true },
            { name: 'Lockout after failing', value: `${cfg.lockoutMin} min`, inline: true },
            { name: 'Max attempts', value: `${cfg.maxAttempts}`, inline: true },
            { name: 'Unverified deadline', value: `${cfg.deadlineDays} days`, inline: true },
            { name: 'Reminders (days left)', value: cfg.reminderDays.join(', ') || 'none', inline: true },
            { name: 'Cleanup mode', value: `\`${cfg.cleanupMode}\``, inline: true },
        );
}

function parseReminderDays(raw) {
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    if (parts.length === 0) return { days: [] };
    if (parts.length > 5) return { error: 'At most 5 reminder days.' };
    const days = [];
    for (const p of parts) {
        if (!/^\d+$/.test(p)) return { error: `\`${p}\` is not a whole number.` };
        days.push(Number(p));
    }
    return { days: [...new Set(days)].sort((a, b) => b - a) };
}

async function handleSettings(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const before = getConfig();
    const patch = {};
    const errors = [];

    const ints = [
        ['question_time_limit', 'questionTimeLimitMin'],
        ['lockout', 'lockoutMin'],
        ['max_attempts', 'maxAttempts'],
        ['deadline_days', 'deadlineDays'],
    ];
    for (const [opt, key] of ints) {
        const v = interaction.options.getInteger(opt);
        if (v === null) continue;
        const [min, max] = BOUNDS[key];
        if (v < min || v > max) errors.push(`\`${opt}\` must be ${min}-${max}.`);
        else patch[key] = v;
    }

    const rawReminders = interaction.options.getString('reminder_days');
    if (rawReminders !== null) {
        const parsed = parseReminderDays(rawReminders);
        if (parsed.error) errors.push(parsed.error);
        else patch.reminderDays = parsed.days;
    }

    const deadline = patch.deadlineDays ?? before.deadlineDays;
    const reminders = patch.reminderDays ?? before.reminderDays;
    if (reminders.some(n => n < 1 || n >= deadline)) {
        errors.push(`Every reminder day must be at least 1 and less than the deadline (${deadline}).`);
    }

    const mode = interaction.options.getString('cleanup_mode');
    if (mode) {
        patch.cleanupMode = mode;
        if (mode !== before.cleanupMode) {
            if (before.cleanupMode === 'disabled') patch.cleanupEnabledAt = Date.now(); // the clock starts now
        }
    }

    if (errors.length) {
        return interaction.editReply({ content: `❌ ${errors.join('\n❌ ')}` });
    }
    if (Object.keys(patch).length === 0) {
        return interaction.editReply({ embeds: [settingsEmbed(before)] });
    }

    setConfig(patch);

    // Switching away from dry run forgets what dry run already announced.
    if (mode && mode !== before.cleanupMode && before.cleanupMode === 'dryrun') {
        store.mutate(users => {
            for (const e of Object.values(users)) { e.dryReminders = []; e.dryKickLogged = false; }
        });
    }
    if (mode && mode !== 'disabled') service.requestSweep();

    await refreshDashboard(interaction.guild);

    let note = '';
    if (patch.cleanupEnabledAt) {
        note = `\nℹ️ Everyone currently unverified gets a fresh **${(patch.deadlineDays ?? before.deadlineDays)}-day** clock starting now.`;
    }
    await interaction.editReply({ content: `✅ Settings saved.${note}`, embeds: [settingsEmbed(getConfig())] });
}

// ─── force ──────────────────────────────────────────────────────────────────
async function handleForce(interaction, client) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const target = interaction.options.getUser('user', true);
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
        return interaction.editReply({ content: '❌ That user isn\'t in this server.' });
    }
    if (service.hasAdventurer(member)) {
        service.clearAll(member.id);
        return interaction.editReply({ content: `ℹ️ ${member} already has the Adventurer role. Any leftover tracking was cleared.`, allowedMentions: { parse: [] } });
    }

    const granted = await service.grantAdventurer(member, `Force verified by ${interaction.user.tag}`);
    if (!granted.ok) {
        return interaction.editReply({ content: `❌ Couldn't assign the role: ${granted.reason}` });
    }
    await log.forced(client, interaction.user, target);
    await interaction.editReply({ content: `✅ ${member} (${target.bot ? 'bot' : 'human'}) was force-verified.`, allowedMentions: { parse: [] } });
}

// ─── extend ─────────────────────────────────────────────────────────────────
async function handleExtend(interaction, client) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const cfg = getConfig();
    const target = interaction.options.getUser('user', true);
    const days = interaction.options.getInteger('days', true);

    if (cfg.cleanupMode === 'disabled') {
        return interaction.editReply({ content: '❌ Cleanup is disabled, so nobody has a deadline to extend.' });
    }
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.editReply({ content: '❌ That user isn\'t in this server.' });
    if (service.isExempt(member)) {
        return interaction.editReply({ content: '❌ That member is exempt (verified, a bot, Clankers or staff). No deadline applies.' });
    }

    const newDeadline = store.update(target.id, e => {
        if (!e.trackedSince) {
            e.trackedSince = Math.max(member.joinedTimestamp ?? Date.now(), cfg.cleanupEnabledAt ?? Date.now());
            e.extraDays = 0;
            e.remindersSent = [];
            e.dryReminders = [];
        }
        e.extraDays = (e.extraDays || 0) + days;
        e.dryKickLogged = false;
        e.skipLogged = false;
        const deadline = service.deadlineOf(e, cfg);
        const now = Date.now();
        e.remindersSent = (e.remindersSent || []).filter(n => service.reminderDueAt(deadline, n) <= now);
        e.dryReminders = (e.dryReminders || []).filter(n => service.reminderDueAt(deadline, n) <= now);
        return deadline;
    });

    await log.extended(client, interaction.user, target, { days, newDeadline });
    await interaction.editReply({ content: `✅ ${member} now has until <t:${Math.floor(newDeadline / 1000)}:F>.`, allowedMentions: { parse: [] } });
}

// ─── status ─────────────────────────────────────────────────────────────────
async function handleStatus(interaction) {
    const cfg = getConfig();
    const users = Object.values(store.all());
    const now = Date.now();
    const tracked = users.filter(e => e.trackedSince);
    const overdue = tracked.filter(e => service.deadlineOf(e, cfg) <= now).length;
    const locked = users.filter(e => e.lockedUntil > now).length;

    const embed = settingsEmbed(cfg).setTitle('🛡️ Verification status').addFields(
        { name: 'Dashboard', value: cfg.dashboardChannelId ? `<#${cfg.dashboardChannelId}>${cfg.dashboardMessageId ? '' : ' (message missing, run `/verification setup`)'}` : 'not posted', inline: true },
        { name: 'Adventurer role', value: cfg.adventurerRoleId ? `<@&${cfg.adventurerRoleId}>` : 'not set', inline: true },
        { name: 'Log channel', value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'not set', inline: true },
        { name: 'Tracked / overdue / locked', value: `${tracked.length} / ${overdue} / ${locked}` },
    );
    await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
}

// ─── router ─────────────────────────────────────────────────────────────────
module.exports = async function verification(interaction, client) {
    if (!isVerificationAdmin(interaction)) return deny(interaction);

    switch (interaction.options.getSubcommand()) {
        case 'setup': return handleSetup(interaction);
        case 'settings': return handleSettings(interaction);
        case 'force': return handleForce(interaction, client);
        case 'extend': return handleExtend(interaction, client);
        case 'status': return handleStatus(interaction);
        case 'pending': return interaction.reply({ ...buildPendingPage(0), flags: EPHEMERAL });
        default: return interaction.reply({ content: '❌ Unknown subcommand.', flags: EPHEMERAL });
    }
};

module.exports.refreshDashboard = refreshDashboard;
