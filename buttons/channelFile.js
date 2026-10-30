const { isAdminChannel } = require('../utils/isAdminChannel');
const jobsStore = require('../utils/channelFileJobs');
const review = require('../utils/channelFileReview');
const { runGuards } = require('../utils/channelFileGuards');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

const DENY = { content: '❌ You do not have permission to use this.', flags: 64 };

// ─── Confirm (from the command's confirmation message) ──────────────────────
async function handleConfirm(interaction, client, [, , targetId, locationId, visibility]) {
    await interaction.deferUpdate();

    const target = await client.channels.fetch(targetId).catch(() => null);
    const location = await client.channels.fetch(locationId).catch(() => null);
    if (!target || !location) {
        await interaction.editReply({ content: '❌ One of the channels no longer exists.', embeds: [], components: [] });
        return;
    }

    const isPrivate = visibility === 'p';

    // Everything is re-checked: the situation may have changed since the command ran.
    const { blocking } = await runGuards({ guild: interaction.guild, target, location, isPrivate });
    if (!GUILDMASTER_CTRL_CHANNEL_ID) blocking.push('The control channel is not configured.');
    if (blocking.length) {
        await interaction.editReply({
            content: `❌ **Cannot file #${target.name}**\n${blocking.map(line => `• ${line}`).join('\n')}`.slice(0, 2000),
            embeds: [],
            components: [],
        });
        return;
    }

    const result = await review.startJob(client, { guild: interaction.guild, target, location, isPrivate, userId: interaction.user.id });
    if (result.error) {
        await interaction.editReply({ content: `❌ ${result.error}`, embeds: [], components: [] });
        return;
    }

    await interaction.editReply({
        content: `✅ Filing of **#${target.name}** has started. Progress and the review message will appear in <#${GUILDMASTER_CTRL_CHANNEL_ID}>.`,
        embeds: [],
        components: [],
    });
}

// ─── Review message buttons ─────────────────────────────────────────────────
async function handleButton(interaction, client) {
    if (!isAdminChannel(interaction, 'cmd')) {
        await interaction.reply(DENY);
        return;
    }

    const parts = interaction.customId.split(':');

    if (parts[1] === 'cancel') {
        await interaction.update({ content: 'Cancelled. Nothing was changed.', embeds: [], components: [] });
        return;
    }
    if (parts[1] === 'confirm') {
        await handleConfirm(interaction, client, parts);
        return;
    }

    const [, jobId, action] = parts;
    const job = jobsStore.getJob(jobId);
    if (!job) {
        await interaction.reply({ content: '❌ This filing has already finished (or no longer exists).', flags: 64 });
        return;
    }

    if (action === 'errors') return review.showErrors(interaction, job);
    if (action === 'abort') return review.abort(client, interaction, jobId);
    if (action === 'rerun') return review.rerun(client, interaction, jobId);

    if (action === 'proceed') {
        if (job.phase !== 'review' || job.failed) {
            await interaction.reply({ content: '❌ This filing is not ready to be completed.', flags: 64 });
            return;
        }
        await interaction.showModal(review.buildProceedModal(job));
        return;
    }

    await interaction.reply({ content: '❌ Unknown action.', flags: 64 });
}

// ─── Proceed modal ──────────────────────────────────────────────────────────
async function handleModal(interaction, client) {
    if (!isAdminChannel(interaction, 'cmd')) {
        await interaction.reply(DENY);
        return;
    }
    const [, jobId, action] = interaction.customId.split(':');
    if (action !== 'proceedModal') {
        await interaction.reply({ content: '❌ Unknown form.', flags: 64 });
        return;
    }
    await review.proceed(client, interaction, jobId);
}

module.exports = {
    prefix: { 'channelFile:': handleButton },
    handleModal,
};
