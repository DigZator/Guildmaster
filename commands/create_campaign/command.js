const { isAdminChannel } = require('../../utils/isAdminChannel');
const { pendingPreviews, PREVIEW_TTL_MS } = require('./state');
const { clip, describeError } = require('./helpers');
const { readOptions, preflight } = require('./preflight');
const { buildPreview, discardPreview, problemsEmbed } = require('./preview');
const { runCampaign } = require('./run');

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
