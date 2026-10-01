const { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');
const {
    buildOverwrites,
    requiredBotPermissions,
    columnsFor,
    overwritesToMap,
    channelToMap,
    renderMatrix,
    diffMaps,
} = require('../utils/campaignPermissions');

const ADMINS_ROLE_ID     = process.env.ADMINS_ROLE_ID;
const CLANKERS_ROLE_ID   = process.env.CLANKERS_ROLE_ID;
const ADVENTURER_ROLE_ID = process.env.ADVENTURER_ROLE_ID;
const DM_ROLE_ID         = process.env.DM_ROLE_ID;

const MAX_PLAYERS       = 6;
const MAX_NAME_LENGTH   = 92;     // "[Table] " (8 chars) + name - 100-char channel limit
const GUILD_ROLE_LIMIT  = 250;
const GUILD_CHAN_LIMIT  = 500;
const EMBED_BUDGET      = 5500;   // Discord caps a message's embeds at 6000 characters

const ICON = {
    ok:         '✅',
    failed:     '❌',
    skipped:    '⏭️',
    warn:       '⚠️',
    rolledback: '🗑️',
    rbfailed:   '🚨',
};

const ERROR_HINTS = {
    10003: 'the channel no longer exists',
    10011: 'the role no longer exists',
    30005: 'the server has reached the 250 role limit',
    30013: 'the server has reached the 500 channel limit',
    30015: 'that category already has the maximum number of channels',
    50001: 'the bot cannot see/access that object',
    50013: 'the bot is missing a permission or its role is too low in the role list',
    50035: 'Discord rejected the request as invalid',
};

// Campaigns currently being created, so two admins can't race
const inProgress = new Set();

const pendingPreviews = new Map();
const PREVIEW_TTL_MS = 5 * 60 * 1000;
const PLACEHOLDER_CAMPAIGN_ROLE = 'campaign-role-not-created-yet';   // stands in for the role in the predicted matrix

function slugify(input) {
    return input
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 90);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const yn    = value => (value ? 'Yes' : 'No');

function clip(text, max) {
    const str = String(text ?? '');
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function describeError(err) {
    const code = err?.code;
    const hint = ERROR_HINTS[code];
    const message = err?.message ?? String(err);
    return `${message}${code ? ` [${code}]` : ''}${hint ? ` — ${hint}` : ''}`;
}

function formatLog(entries) {
    return entries
        .map(e => `${ICON[e.status] ?? '•'} ${e.label}${e.detail ? ` — ${clip(e.detail, 220)}` : ''}`)
        .join('\n');
}

function embedSize(embed) {
    const d = embed.data ?? {};
    return (d.title?.length ?? 0)
        + (d.description?.length ?? 0)
        + (d.footer?.text?.length ?? 0)
        + (d.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
}

// Groups embeds into messages that stay under Discord's combined-size and count limits.
function chunkEmbeds(embeds) {
    const chunks = [];
    let current = [];
    let size = 0;
    for (const embed of embeds) {
        const s = embedSize(embed);
        if (current.length && (size + s > EMBED_BUDGET || current.length >= 10)) {
            chunks.push(current);
            current = [];
            size = 0;
        }
        current.push(embed);
        size += s;
    }
    if (current.length) chunks.push(current);
    return chunks;
}

function readOptions(interaction) {
    const playerUsers = [];
    for (let slot = 1; slot <= MAX_PLAYERS; slot++) {
        const user = interaction.options.getUser(`player_${slot}`);
        if (user) playerUsers.push({ slot, user });
    }
    return {
        rawName:       interaction.options.getString('name', true),
        dmUser:        interaction.options.getUser('dm', true),
        useStage:      interaction.options.getBoolean('use_stage') ?? false,
        readChat:      interaction.options.getBoolean('spectators_read_chat', true),
        sendMessages:  interaction.options.getBoolean('spectators_send_messages', true),
        joinVoice:     interaction.options.getBoolean('spectators_join_voice', true),
        sendVoiceChat: interaction.options.getBoolean('spectators_send_voice_chat', true),
        playerUsers,
    };
}

// ── Preflight: everything that can be checked BEFORE anything is created ────
async function preflight(interaction, opts) {
    const guild = interaction.guild;
    const problems = [];

    // Names — role, category and voice keep the casing that was typed;
    const baseName = opts.rawName.trim();
    const textName = slugify(baseName);
    const roleName = baseName;
    const categoryName = baseName;
    const voiceName = `[Table] ${baseName}`;

    if (!baseName) {
        problems.push('The campaign name is empty.');
    } else {
        if (baseName.length > MAX_NAME_LENGTH) {
            problems.push(`The campaign name is ${baseName.length} characters; the maximum is ${MAX_NAME_LENGTH}.`);
        }
        if (baseName.includes('@')) {
            problems.push('The campaign name cannot contain `@`.');
        }
        if (!textName) {
            problems.push('The name has no letters or numbers, so a text channel name cannot be made from it.');
        }
    }

    // Configuration
    const config = [
        ['ADMINS_ROLE_ID', ADMINS_ROLE_ID],
        ['CLANKERS_ROLE_ID', CLANKERS_ROLE_ID],
        ['ADVENTURER_ROLE_ID', ADVENTURER_ROLE_ID],
        ['DM_ROLE_ID', DM_ROLE_ID],
    ];
    const unset = config.filter(([, value]) => !value).map(([name]) => `\`${name}\``);
    if (unset.length) problems.push(`Not configured in \`.env\`: ${unset.join(', ')}.`);

    if (ADMINS_ROLE_ID && (ADMINS_ROLE_ID === CLANKERS_ROLE_ID || ADMINS_ROLE_ID === ADVENTURER_ROLE_ID || CLANKERS_ROLE_ID === ADVENTURER_ROLE_ID)) {
        problems.push('`ADMINS_ROLE_ID`, `CLANKERS_ROLE_ID` and `ADVENTURER_ROLE_ID` must be three different roles.');
    }

    let roles = null;
    let channels = null;
    try {
        roles = await guild.roles.fetch();
        channels = (await guild.channels.fetch()).filter(Boolean);
    } catch (err) {
        problems.push(`Could not read the server's roles/channels: ${describeError(err)}`);
    }

    if (roles) {
        for (const [name, value] of config) {
            if (value && !roles.has(value)) problems.push(`\`${name}\` points to a role that doesn't exist in this server.`);
        }

        const lower = baseName.toLowerCase();
        if (baseName && roles.find(r => r.name.toLowerCase() === lower)) {
            problems.push(`A role named \`${roleName}\` already exists.`);
        }
        if (roles.size + 1 > GUILD_ROLE_LIMIT) {
            problems.push(`The server is at its role limit (${GUILD_ROLE_LIMIT}).`);
        }
    }

    if (channels && baseName) {
        const lower = baseName.toLowerCase();
        if (channels.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === lower)) {
            problems.push(`A category named \`${categoryName}\` already exists.`);
        }
        if (textName && channels.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === textName)) {
            problems.push(`A text channel named \`${textName}\` already exists.`);
        }
        if (channels.find(c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.name.toLowerCase() === voiceName.toLowerCase())) {
            problems.push(`A voice/stage channel named \`${voiceName}\` already exists.`);
        }
        const nonThread = channels.filter(c => !c.isThread()).size;
        if (nonThread + 3 > GUILD_CHAN_LIMIT) {
            problems.push(`The server doesn't have room for 3 more channels (limit ${GUILD_CHAN_LIMIT}).`);
        }
    }

    let me = guild.members.me;
    if (!me) me = await guild.members.fetchMe().catch(() => null);
    let moderateStage = false;
    if (!me) {
        problems.push("Could not load the bot's own member record to check its permissions.");
    } else {
        const missing = me.permissions.missing(requiredBotPermissions({ useStage: opts.useStage }));
        if (missing.length) {
            problems.push(`The bot is missing permissions it needs to set this up: ${missing.map(m => `\`${m}\``).join(', ')}.`);
        }
        moderateStage = opts.useStage && me.permissions.has([PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers]);
    }

    // The DM
    let dmMember = null;
    let dmNeedsRole = false;
    if (opts.dmUser.bot) {
        problems.push('The DM cannot be a bot.');
    } else {
        dmMember = await guild.members.fetch(opts.dmUser.id).catch(() => null);
        if (!dmMember) {
            problems.push(`<@${opts.dmUser.id}> is not a member of this server.`);
        } else if (DM_ROLE_ID) {
            dmNeedsRole = !dmMember.roles.cache.has(DM_ROLE_ID);
            const dmRole = roles?.get(DM_ROLE_ID);
            if (dmNeedsRole && dmRole && me && me.roles.highest.comparePositionTo(dmRole) <= 0) {
                problems.push(`The bot's highest role is not above the DM role (\`${dmRole.name}\`), so it can't grant it. Move the bot's role higher.`);
            }
        }
    }

    // Players
    const seen = new Set([opts.dmUser.id]);
    const playerPlan = [];
    for (const { slot, user } of opts.playerUsers) {
        const item = { slot, user, member: null, skip: null };
        if (user.id === opts.dmUser.id) item.skip = 'same person as the DM';
        else if (seen.has(user.id))     item.skip = 'listed more than once';
        else if (user.bot)              item.skip = 'is a bot';
        else {
            seen.add(user.id);
            item.member = await guild.members.fetch(user.id).catch(() => null);
            if (!item.member) item.skip = 'not a member of this server';
        }
        playerPlan.push(item);
    }

    return {
        problems,
        plan: {
            baseName, roleName, categoryName, textName, voiceName,
            roleIds: {
                everyone:   guild.roles.everyone.id,
                admins:     ADMINS_ROLE_ID,
                clankers:   CLANKERS_ROLE_ID,
                adventurer: ADVENTURER_ROLE_ID,
            },
            dmMember, dmNeedsRole, playerPlan, moderateStage,
        },
    };
}

// ── Rollback ────────────────────────────────────────────────────────────────
async function deleteWithRetry(object, reason) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            await object.delete(reason);
            return { ok: true, note: attempt > 1 ? 'deleted on retry' : 'deleted' };
        } catch (err) {
            if (err?.code === 10003 || err?.code === 10011) return { ok: true, note: 'was already gone' };
            lastError = err;
            if (attempt < 2) await sleep(1500);
        }
    }
    return { ok: false, error: lastError };
}

async function rollback(guild, created, plan) {
    const entries = [];
    const steps = [
        ['voice/stage channel', created.voice],
        ['text channel',        created.text],
        ['category',            created.category],
        ['role',                created.role],
    ];

    for (const [kind, object] of steps) {
        if (!object) continue;
        const label = `Delete ${kind} "${object.name}"`;
        const result = await deleteWithRetry(object, 'create_campaign rollback');
        if (result.ok) {
            entries.push({ status: 'rolledback', label, detail: `${result.note} (\`${object.id}\`)` });
            console.log(`[create_campaign] 🗑️ Rollback: ${label} — ${result.note}`);
        } else {
            entries.push({
                status: 'rbfailed',
                incomplete: true,
                label,
                detail: `FAILED: ${describeError(result.error)} — delete it manually (id \`${object.id}\`)`,
            });
            console.error(`[create_campaign] 🚨 Rollback failed: ${label}`, result.error);
        }
    }

    try {
        const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
        const lower = plan.baseName.toLowerCase();
        const voiceLower = plan.voiceName.toLowerCase();
        const found = [];
        roles.forEach(r => {
            if (r.name.toLowerCase() === lower) found.push(`role "${r.name}" (\`${r.id}\`)`);
        });
        channels.forEach(c => {
            if (!c) return;
            const n = c.name.toLowerCase();
            if (c.type === ChannelType.GuildCategory && n === lower) {
                found.push(`category "${c.name}" (\`${c.id}\`)`);
            } else if (c.type === ChannelType.GuildText && n === plan.textName) {
                found.push(`text channel "${c.name}" (\`${c.id}\`)`);
            } else if ((c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && n === voiceLower) {
                found.push(`voice/stage channel "${c.name}" (\`${c.id}\`)`);
            }
        });
        if (found.length) {
            entries.push({ status: 'warn', incomplete: true, label: 'Leftover check', detail: `still in the server, delete manually: ${found.join('; ')}` });
        } else {
            entries.push({ status: 'ok', label: 'Leftover check', detail: "nothing with this campaign's names remains in the server" });
        }
    } catch (err) {
        entries.push({ status: 'warn', incomplete: true, label: 'Leftover check', detail: `could not verify the server is clean: ${describeError(err)}` });
    }

    return entries;
}

// ── Execute: create → verify → assign ───────────────────────────────────────

async function grantRole(member, roleId, label, reason) {
    try {
        await member.roles.add(roleId, reason);
        return { status: 'ok', label };
    } catch (err) {
        console.error(`[create_campaign] ⚠️ ${label} failed:`, err);
        return { status: 'failed', label, detail: describeError(err) };
    }
}

async function execute(interaction, opts, plan) {
    const guild = interaction.guild;
    const reason = `create_campaign by ${interaction.user.tag}`;
    const log = [];
    const created = {};
    const ids = { ...plan.roleIds };
    let overwrites = null;
    let failure = null;

    const spectator = {
        readChat: opts.readChat,
        sendMessages: opts.sendMessages,
        joinVoice: opts.joinVoice,
        sendVoiceChat: opts.sendVoiceChat,
        useStage: opts.useStage,
        moderateStage: plan.moderateStage,
    };

    const structure = [
        {
            key: 'role',
            label: `Create role "${plan.roleName}"`,
            run: () => guild.roles.create({ name: plan.roleName, reason }),
            show: o => `<@&${o.id}>`,
        },
        {
            key: 'category',
            label: `Create category "${plan.categoryName}"`,
            run: () => {
                ids.campaign = created.role.id;
                overwrites = buildOverwrites({ ids, ...spectator });
                return guild.channels.create({
                    name: plan.categoryName,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: overwrites.category,
                    reason,
                });
            },
            show: o => `\`${o.id}\``,
        },
        {
            key: 'text',
            label: `Create text channel "#${plan.textName}"`,
            run: () => guild.channels.create({
                name: plan.textName,
                type: ChannelType.GuildText,
                parent: created.category.id,
                permissionOverwrites: overwrites.text,
                reason,
            }),
            show: o => `<#${o.id}>`,
        },
        {
            key: 'voice',
            label: `Create ${opts.useStage ? 'stage' : 'voice'} channel "${plan.voiceName}"`,
            run: () => guild.channels.create({
                name: plan.voiceName,
                type: opts.useStage ? ChannelType.GuildStageVoice : ChannelType.GuildVoice,
                parent: created.category.id,
                permissionOverwrites: overwrites.voice,
                reason,
            }),
            show: o => `<#${o.id}>`,
        },
    ];

    // Phase 1 — structure (all-or-nothing)
    for (let i = 0; i < structure.length; i++) {
        const step = structure[i];
        try {
            created[step.key] = await step.run();
            log.push({ status: 'ok', label: step.label, detail: step.show(created[step.key]) });
            console.log(`[create_campaign] ✅ ${step.label} (${created[step.key].id})`);
        } catch (err) {
            failure = { label: step.label, error: describeError(err) };
            log.push({ status: 'failed', label: step.label, detail: describeError(err) });
            console.error(`[create_campaign] ❌ ${step.label} failed:`, err);
            for (const rest of structure.slice(i + 1)) {
                log.push({ status: 'skipped', label: rest.label, detail: 'not attempted' });
            }
            break;
        }
    }

    if (failure) {
        log.push({ status: 'skipped', label: 'Give roles to the DM and players', detail: 'not attempted' });
        const rollbackLog = await rollback(guild, created, plan);
        return { log, rollbackLog, created, failure, matrices: null, mismatches: [], verifiedFromDiscord: false };
    }

    // Phase 2 — verify what Discord actually stored
    const matrices = {};
    const mismatches = [];
    let verifiedFromDiscord = true;
    try {
        for (const kind of ['category', 'text', 'voice']) {
            let channel = created[kind];
            try {
                channel = (await guild.channels.fetch(created[kind].id, { force: true })) ?? created[kind];
            } catch {
                verifiedFromDiscord = false;
            }
            const columns = columnsFor(kind, { useStage: opts.useStage, moderateStage: plan.moderateStage });
            const plannedMap = overwritesToMap(overwrites[kind], ids);
            const actualMap = channelToMap(channel, ids);
            matrices[kind] = { columns, map: actualMap };
            mismatches.push(...diffMaps(columns, plannedMap, actualMap, kind === 'text' ? 'Text' : kind === 'voice' ? 'Voice' : 'Category'));
        }
        if (mismatches.length) {
            log.push({ status: 'warn', label: 'Verify permissions', detail: `${mismatches.length} difference(s) from the plan — see the matrix and fix manually` });
        } else if (!verifiedFromDiscord) {
            log.push({ status: 'warn', label: 'Verify permissions', detail: "couldn't re-read a channel from Discord; matrix shows what was returned at creation" });
        } else {
            log.push({ status: 'ok', label: 'Verify permissions', detail: 'read back from Discord and matches the plan' });
        }
    } catch (err) {
        console.error('[create_campaign] ⚠️ Verification crashed:', err);
        log.push({ status: 'warn', label: 'Verify permissions', detail: `verification failed: ${describeError(err)}` });
        for (const kind of ['category', 'text', 'voice']) {
            if (!matrices[kind]) {
                matrices[kind] = {
                    columns: columnsFor(kind, { useStage: opts.useStage, moderateStage: plan.moderateStage }),
                    map: overwritesToMap(overwrites[kind], ids),
                };
            }
        }
        verifiedFromDiscord = false;
    }

    // Phase 3 — people (failure here never undoes the campaign)
    const campaignRoleId = created.role.id;
    if (plan.dmNeedsRole) {
        log.push(await grantRole(plan.dmMember, DM_ROLE_ID, `Give DM role to <@${opts.dmUser.id}>`, reason));
    } else {
        log.push({ status: 'skipped', label: `Give DM role to <@${opts.dmUser.id}>`, detail: 'already has it' });
    }
    log.push(await grantRole(plan.dmMember, campaignRoleId, `Give campaign role to DM <@${opts.dmUser.id}>`, reason));

    for (const p of plan.playerPlan) {
        const label = `Give campaign role to player ${p.slot} <@${p.user.id}>`;
        if (p.skip) {
            log.push({ status: 'skipped', label, detail: p.skip });
        } else {
            log.push(await grantRole(p.member, campaignRoleId, label, reason));
        }
    }

    return { log, rollbackLog: [], created, failure: null, matrices, mismatches, verifiedFromDiscord };
}

// ── Report ──────────────────────────────────────────────────────────────────

function outcomeOf(result) {
    if (result.failure) {
        return result.rollbackLog.some(e => e.incomplete) ? 'rollback_incomplete' : 'rolled_back';
    }
    return result.log.some(e => e.status === 'failed' || e.status === 'warn') ? 'warnings' : 'success';
}

const OUTCOME_STYLE = {
    success:             { color: 0x57f287, title: '✅ Campaign Created' },
    warnings:            { color: 0xfee75c, title: '⚠️ Campaign Created — with problems' },
    rolled_back:         { color: 0xed4245, title: '❌ Campaign Failed — Rolled Back' },
    rollback_incomplete: { color: 0x992d22, title: '🚨 Campaign Failed — Rollback INCOMPLETE, manual cleanup needed' },
};

// The admin's answers, as shown in both the preview and the final report.
function conditionLines(opts) {
    const spectatorsSeeVoice = opts.readChat || opts.joinVoice;
    return [
        `**Campaign name:** ${opts.rawName.trim()}`,
        `**DM:** <@${opts.dmUser.id}>`,
        `**Use stage:** ${yn(opts.useStage)}`,
        `**Spectators read chat:** ${yn(opts.readChat)}`,
        `**Spectators send messages:** ${yn(opts.sendMessages)}${opts.readChat ? '' : ' _(not applied — chat is hidden)_'}`,
        `**Spectators join voice:** ${yn(opts.joinVoice)}`,
        `**Spectators send chat in voice:** ${yn(opts.sendVoiceChat)}${spectatorsSeeVoice ? '' : ' _(not applied — voice is hidden)_'}`,
        `**Players:** ${opts.playerUsers.length ? opts.playerUsers.map(p => `<@${p.user.id}>`).join(' ') : 'none'}`,
    ].join('\n');
}

function buildReportEmbeds({ interaction, opts, plan, result }) {
    const outcome = outcomeOf(result);
    const style = OUTCOME_STYLE[outcome];
    const conditions = conditionLines(opts);

    const summary = new EmbedBuilder()
        .setColor(style.color)
        .setTitle(style.title)
        .addFields(
            { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Conditions provided', value: clip(conditions, 1024), inline: false },
        )
        .setTimestamp();

    if (result.failure) {
        summary.setDescription(clip(
            `Setup failed at **${result.failure.label}**.\n\`${clip(result.failure.error, 400)}\`\n\n` +
            (outcome === 'rollback_incomplete'
                ? '**Some created items could not be removed — see the Rollback section below.**'
                : 'Everything that had been created was removed.'),
            4000,
        ));
    } else {
        const c = result.created;
        summary.addFields({
            name: 'Created',
            value: clip([
                `**Role:** <@&${c.role.id}>`,
                `**Category:** ${c.category.name}`,
                `**Text channel:** <#${c.text.id}>`,
                `**${opts.useStage ? 'Stage' : 'Voice'} channel:** <#${c.voice.id}>`,
            ].join('\n'), 1024),
            inline: false,
        });

        if (opts.useStage) {
            summary.addFields({
                name: plan.moderateStage ? 'Stage speakers' : '⚠️ Manual step required',
                value: clip(plan.moderateStage
                    ? 'The campaign role, Admins and Clankers were given Mute Members + Move Members on the stage so they can bring people up to speak.'
                    : `The bot doesn't hold Mute/Move Members, so it can't grant speaker permissions on stage channels. To let **<@&${c.role.id}>** speak: open the stage channel's settings → **Permissions**, add the **${plan.roleName}** role and grant **Mute Members** + **Move Members** (or make people speakers from the Stage UI during the session).`, 1024),
                inline: false,
            });
        }
    }

    const embeds = [summary];

    const actionLines = [`**Actions**\n${formatLog(result.log)}`];
    if (result.rollbackLog.length) actionLines.push(`\n**Rollback**\n${formatLog(result.rollbackLog)}`);
    embeds.push(new EmbedBuilder()
        .setColor(style.color)
        .setDescription(clip(actionLines.join('\n'), 4000)));

    // Permission matrix
    if (result.matrices) {
        const mismatchText = result.mismatches.length
            ? `\n\n⚠️ **Differs from plan:**\n${result.mismatches.slice(0, 8).map(m => `• ${m}`).join('\n')}${result.mismatches.length > 8 ? `\n…and ${result.mismatches.length - 8} more` : ''}`
            : '';
        embeds.push(new EmbedBuilder()
            .setColor(style.color)
            .setTitle('Permission matrix')
            .setDescription(clip(
                `${result.verifiedFromDiscord ? 'Read back from Discord after creation.' : "Couldn't re-read from Discord — shown as planned/returned at creation."}\n` +
                '✔ allowed · ✖ denied · – not set (server defaults apply)\n' +
                'Spectators = the Adventurer role. The Campaign role holds the DM and players.' +
                mismatchText,
                4000,
            ))
            .addFields(
                { name: 'Category', value: renderMatrix(result.matrices.category.columns, result.matrices.category.map), inline: false },
                { name: 'Text channel', value: renderMatrix(result.matrices.text.columns, result.matrices.text.map), inline: false },
                { name: opts.useStage ? 'Stage channel' : 'Voice channel', value: renderMatrix(result.matrices.voice.columns, result.matrices.voice.map), inline: false },
            ));
    }

    return embeds;
}

function fallbackText(result) {
    const lines = [`Campaign setup finished (${outcomeOf(result)}) but the report couldn't be built.`, formatLog(result.log)];
    if (result.rollbackLog.length) lines.push('Rollback:', formatLog(result.rollbackLog));
    return clip(lines.join('\n'), 1900);
}

async function deliverReport(interaction, embeds) {
    const guild = interaction.guild;
    const chunks = chunkEmbeds(embeds);

    try {
        await interaction.editReply({ content: '', embeds: chunks[0] });
        for (const chunk of chunks.slice(1)) {
            await interaction.followUp({ embeds: chunk, flags: 64 });
        }
    } catch (err) {
        console.error('[create_campaign] ⚠️ Failed to deliver the ephemeral report:', err);
    }

    let ctrlError = null;
    if (!GUILDMASTER_CTRL_CHANNEL_ID) {
        ctrlError = '`GUILDMASTER_CTRL_CHANNEL_ID` is not configured';
    } else {
        const ctrl = guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID)
            ?? await guild.channels.fetch(GUILDMASTER_CTRL_CHANNEL_ID).catch(() => null);
        if (!ctrl) {
            ctrlError = 'the guildmaster-ctrl channel could not be found';
        } else {
            try {
                for (const chunk of chunks) {
                    await ctrl.send({ embeds: chunk, allowedMentions: { parse: [] } });
                }
                console.log('[create_campaign] 📨 Posted report to guildmaster-ctrl');
            } catch (err) {
                ctrlError = describeError(err);
                console.error('[create_campaign] ⚠️ Failed to post report to guildmaster-ctrl:', err);
            }
        }
    }

    if (ctrlError) {
        await interaction.followUp({
            content: `⚠️ The report could not be posted to guildmaster-ctrl: ${ctrlError}.`,
            flags: 64,
        }).catch(e => console.error('[create_campaign] ⚠️ Could not tell the admin about the ctrl failure:', e));
    }
}

// ── Preview ─────────────────────────────────────────────────────────────────

function buildPreview(interaction, opts, plan) {
    const ids = { ...plan.roleIds, campaign: PLACEHOLDER_CAMPAIGN_ROLE };
    const overwrites = buildOverwrites({
        ids,
        readChat: opts.readChat,
        sendMessages: opts.sendMessages,
        joinVoice: opts.joinVoice,
        sendVoiceChat: opts.sendVoiceChat,
        useStage: opts.useStage,
        moderateStage: plan.moderateStage,
    });

    const matrixFor = kind => renderMatrix(
        columnsFor(kind, { useStage: opts.useStage, moderateStage: plan.moderateStage }),
        overwritesToMap(overwrites[kind], ids),
    );

    const willCreate = [
        `**Role:** ${plan.roleName}`,
        `**Category:** ${plan.categoryName}`,
        `**Text channel:** #${plan.textName}`,
        `**${opts.useStage ? 'Stage' : 'Voice'} channel:** ${plan.voiceName}`,
    ].join('\n');

    const people = [`**DM:** <@${opts.dmUser.id}>${plan.dmNeedsRole ? ' — will also be given the DM role' : ''}`];
    for (const p of plan.playerPlan) {
        people.push(`**Player ${p.slot}:** <@${p.user.id}>${p.skip ? ` — ⏭️ will be skipped (${p.skip})` : ''}`);
    }

    const summary = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📝 Create campaign — preview')
        .setDescription('**Nothing has been created yet.** Check the details below, then confirm.')
        .addFields(
            { name: 'Will be created', value: clip(willCreate, 1024), inline: false },
            { name: 'People', value: clip(people.join('\n'), 1024), inline: false },
            { name: 'Your answers', value: clip(conditionLines(opts), 1024), inline: false },
        );

    const matrix = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Planned permission matrix')
        .setDescription('✔ allowed · ✖ denied · – not set (server defaults apply)\nSpectators = the Adventurer role. The Campaign role holds the DM and players.')
        .addFields(
            { name: 'Category', value: matrixFor('category'), inline: false },
            { name: 'Text channel', value: matrixFor('text'), inline: false },
            { name: opts.useStage ? 'Stage channel' : 'Voice channel', value: matrixFor('voice'), inline: false },
        )
        .setFooter({ text: `This preview expires in ${PREVIEW_TTL_MS / 60000} minutes. Everything is re-checked when you confirm.` });

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('create_campaign_confirm').setLabel('Create campaign').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('create_campaign_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [summary, matrix], components: [buttons] };
}

function discardPreview(userId) {
    const pending = pendingPreviews.get(userId);
    if (!pending) return null;
    clearTimeout(pending.timer);
    pendingPreviews.delete(userId);
    return pending;
}

function problemsEmbed(problems, title) {
    return new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(title)
        .setDescription(clip(problems.map(p => `• ${p}`).join('\n'), 4000));
}

// ── Running a confirmed campaign ────────────────────────────────────────────

async function runCampaign(interaction, opts, plan) {
    const lockKey = opts.rawName.trim().toLowerCase();

    if (inProgress.has(lockKey)) {
        await interaction.editReply({ content: `❌ A campaign named \`${opts.rawName.trim()}\` is already being created. Wait for it to finish.`, embeds: [], components: [] });
        return;
    }
    inProgress.add(lockKey);

    try {
        const result = await execute(interaction, opts, plan);

        let embeds;
        try {
            embeds = buildReportEmbeds({ interaction, opts, plan, result });
        } catch (err) {
            console.error('[create_campaign] ⚠️ Failed to build the report embeds:', err);
            await interaction.editReply({ content: fallbackText(result), embeds: [], components: [] }).catch(() => {});
            return;
        }

        await deliverReport(interaction, embeds);
        console.log(`[create_campaign] Finished "${plan.baseName}" — outcome: ${outcomeOf(result)}`);
    } catch (err) {
        console.error('[create_campaign] ❌ Unexpected error:', err);
        await interaction.editReply({
            content: `❌ Unexpected error: \`${clip(describeError(err), 500)}\`\nCheck the campaign's role/category/channels manually and the bot logs.`,
            embeds: [],
            components: [],
        }).catch(() => {});
    } finally {
        inProgress.delete(lockKey);
    }
}

// ── Entry point ─────────────────────────────────────────────────────────────
module.exports = async (interaction) => {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        await interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
        return;
    }
    if (!interaction.guild) {
        await interaction.reply({ content: '❌ This command can only be used in a server.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const opts = readOptions(interaction);

    try {
        discardPreview(interaction.user.id);

        const { problems, plan } = await preflight(interaction, opts);

        if (problems.length) {
            await interaction.editReply({ embeds: [problemsEmbed(problems, '❌ Campaign not created — nothing was changed')] });
            console.log(`[create_campaign] Preflight failed for "${opts.rawName.trim()}": ${problems.length} problem(s)`);
            return;
        }

        const preview = await interaction.editReply({ content: '', ...buildPreview(interaction, opts, plan) });

        const timer = setTimeout(() => {
            if (pendingPreviews.get(interaction.user.id)?.previewMessageId !== preview.id) return;
            pendingPreviews.delete(interaction.user.id);
            interaction.editReply({ content: '⌛ This preview expired — nothing was created. Run `/create_campaign` again.', embeds: [], components: [] }).catch(() => {});
        }, PREVIEW_TTL_MS);

        pendingPreviews.set(interaction.user.id, { opts, previewMessageId: preview.id, timer });
    } catch (err) {
        console.error('[create_campaign] ❌ Unexpected error while preparing the preview:', err);
        await interaction.editReply({
            content: `❌ Unexpected error: \`${clip(describeError(err), 500)}\`\nNothing was created.`,
            embeds: [],
            components: [],
        }).catch(() => {});
    }
};

// ── Button handlers (wired up in buttons/createCampaign.js) ─────────────────
function claimPreview(interaction) {
    const pending = pendingPreviews.get(interaction.user.id);
    if (!pending) {
        interaction.followUp({ content: '❌ This preview has expired or was already handled.', flags: 64 }).catch(() => {});
        return null;
    }
    if (pending.previewMessageId !== interaction.message?.id) {
        interaction.editReply({ content: '⚠️ This preview is outdated — a newer one replaced it.', embeds: [], components: [] }).catch(() => {});
        return null;
    }
    // Claimed synchronously (no await since the lookup), so a double-click can't run it twice.
    return discardPreview(interaction.user.id);
}

module.exports.confirmCampaign = async (interaction) => {
    await interaction.deferUpdate();

    const pending = claimPreview(interaction);
    if (!pending) return;

    try {
        const { problems, plan } = await preflight(interaction, pending.opts);
        if (problems.length) {
            await interaction.editReply({ content: '', embeds: [problemsEmbed(problems, '❌ Campaign not created — things changed since the preview, nothing was changed')], components: [] });
            console.log(`[create_campaign] Re-check failed for "${pending.opts.rawName.trim()}": ${problems.length} problem(s)`);
            return;
        }

        await interaction.editReply({ content: '⏳ Creating the campaign…', embeds: [], components: [] });
        await runCampaign(interaction, pending.opts, plan);
    } catch (err) {
        console.error('[create_campaign] ❌ Unexpected error on confirm:', err);
        await interaction.editReply({
            content: `❌ Unexpected error: \`${clip(describeError(err), 500)}\`\nCheck the campaign's role/category/channels manually and the bot logs.`,
            embeds: [],
            components: [],
        }).catch(() => {});
    }
};

module.exports.cancelCampaign = async (interaction) => {
    await interaction.deferUpdate();

    const pending = claimPreview(interaction);
    if (!pending) return;

    await interaction.editReply({ content: '❌ Cancelled — nothing was created.', embeds: [], components: [] });
};
