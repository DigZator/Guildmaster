const { ChannelType } = require('discord.js');
const { buildOverwrites, columnsFor, overwritesToMap, channelToMap, diffMaps } = require('../../utils/campaignPermissions');
const { DM_ROLE_ID } = require('./constants');
const { describeError } = require('./helpers');
const { rollback } = require('./rollback');

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

module.exports = {
    execute,
};
