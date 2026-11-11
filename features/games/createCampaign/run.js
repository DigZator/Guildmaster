const { inProgress } = require('./state');
const { clip, describeError } = require('./helpers');
const { execute } = require('./execute');
const { outcomeOf, buildReportEmbeds, fallbackText, deliverReport } = require('./report');

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

module.exports = {
    runCampaign,
};
