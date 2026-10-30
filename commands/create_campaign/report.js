const { EmbedBuilder } = require('discord.js');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../../data/channels');
const { renderMatrix } = require('../../utils/campaignPermissions');
const { yn, clip, describeError, formatLog, chunkEmbeds } = require('./helpers');

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

module.exports = {
    outcomeOf,
    conditionLines,
    buildReportEmbeds,
    fallbackText,
    deliverReport,
};
