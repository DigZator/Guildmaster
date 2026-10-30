const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildOverwrites, columnsFor, overwritesToMap, renderMatrix } = require('../../utils/campaignPermissions');
const { PLACEHOLDER_CAMPAIGN_ROLE } = require('./constants');
const { pendingPreviews, PREVIEW_TTL_MS } = require('./state');
const { clip } = require('./helpers');
const { conditionLines } = require('./report');

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

module.exports = {
    buildPreview,
    discardPreview,
    problemsEmbed,
};
