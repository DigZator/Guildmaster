// The words and buttons of the channel-filing review: the review message, the "working" and "needs attention" versions,
// the error report, the Proceed modal and the completion note. Pure builders: they read a job and return a Discord payload,
// and touch no channel, store or timer (the flow that uses them is review.js).
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const GREEN = 0x57F287;
const ORANGE = 0xFEE75C;
const RED = 0xED4245;

const customId = (jobId, action) => `channelFile:${jobId}:${action}`;

const threadLink = (guildId, threadId) => `https://discord.com/channels/${guildId}/${threadId}`;

const formatBytes = bytes => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

function checkLine(label, check, detail) {
    return `${check?.ok ? '✅' : '⚠️'} ${label}: ${detail}`;
}

function describeChecks(job) {
    const { c1, c2, c3 } = job.checks ?? {};

    if (c3) {
        return [
            checkLine('Inventory vs. transcript', c1, `${c1.collected} messages collected, ${c1.missing} not posted`),
            checkLine('Destination read-back', c2, `${c2.checked} posts checked, ${c2.bad} problem(s)`),
            checkLine('Fresh re-scan', c3, `${c3.deleted} deleted since filing, ${c3.extraMessages} new message(s) and ${c3.newThreads} new thread(s) not filed`),
        ];
    }

    const copyDetail = c1
        ? `${c1.checked} posts checked${c1.batches ? ` in ${c1.batches} batch check(s) while filing` : ' (full re-read)'}, ${c1.bad ?? 0} problem(s)`
        : 'not run';
    return [
        checkLine('Filed copy read-back', c1, copyDetail),
        checkLine('Fresh re-scan of the source', c2, c2 ? `${c2.deleted} deleted since filing, ${c2.extraMessages} new message(s) and ${c2.newThreads} new thread(s) not filed` : 'not run'),
    ];
}

function buildReviewMessage(job) {
    const snagCount = (job.snags?.length ?? 0) + (job.snagOverflow ?? 0);
    const lost = job.lost ?? { count: 0, bytes: 0 };
    const counts = job.counts ?? {};

    const lines = [
        `**Channel:** #${job.targetName}`,
        `**Filed copy:** ${threadLink(job.guildId, job.mainThreadId)}`,
        `**Filed by:** <@${job.startedBy}>`,
        `**Contents:** ${counts.messages ?? 0} messages, ${counts.files ?? 0} files reposted, ${counts.publicThreads ?? 0} public thread(s) inlined`,
        counts.privateThreads ? `**Private threads:** ${counts.privateThreads} filed separately (details in the completion note)` : null,
        '',
        ...describeChecks(job),
        '',
        job.freezeIssues?.length ? '🧊⚠️ **The channel was not fully frozen.** Anything posted while filing ran is not in the copy and will be lost if you proceed — see **Display errors**.' : null,
        snagCount ? `⚠️ **${snagCount} snag(s)** — press **Display errors** to see them.` : '✅ **No snags.**',
        lost.count ? `🗑️ **${lost.count} file(s) (${formatBytes(lost.bytes)}) will be permanently lost** if you proceed.` : null,
        '',
        `The channel stays as it is until someone presses **Proceed** or **Abort**. Nothing is deleted automatically, and these buttons never expire.`,
    ].filter(line => line !== null);

    const embed = new EmbedBuilder()
        .setTitle('🗄️ Channel filing — ready for review')
        .setColor(snagCount ? ORANGE : GREEN)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: `Job ${job.id.slice(0, 8)}` })
        .setTimestamp(job.reviewReadyAt ?? Date.now());

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId(job.id, 'errors')).setLabel('Display errors').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(customId(job.id, 'proceed')).setLabel('Proceed').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(customId(job.id, 'abort')).setLabel('Abort').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(customId(job.id, 'rerun')).setLabel('Re-run checks').setStyle(ButtonStyle.Primary),
    );

    return { embeds: [embed], components: [row] };
}

function buildBusyMessage(job, text) {
    const payload = buildReviewMessage(job);
    payload.embeds[0].addFields({ name: '⏳ Working', value: text.slice(0, 1024) });
    payload.components = [];
    return payload;
}

function stuckMessage(job, reason, problems) {
    const embed = new EmbedBuilder()
        .setTitle('🚨 Channel filing needs attention')
        .setColor(RED)
        .setDescription([
            `**Channel:** #${job.targetName ?? 'unknown'}`,
            `**What happened:** ${reason}`,
            '',
            '**Could not be undone automatically:**',
            ...problems.map(p => `• ${p}`),
            '',
            'Nothing has been deleted. Press **Abort** to retry the revert once the problem is fixed.',
        ].join('\n').slice(0, 4000))
        .setFooter({ text: `Job ${job.id.slice(0, 8)}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId(job.id, 'abort')).setLabel('Abort').setStyle(ButtonStyle.Danger),
    );
    return { embeds: [embed], components: [row] };
}

function buildReport(job) {
    const lines = [`Filing report — #${job.targetName} (job ${job.id.slice(0, 8)})`, '', 'Checks:', ...describeChecks(job), ''];

    if (job.failed) lines.push(`This job failed: ${job.failed}`, ...(job.revertProblems ?? []).map(p => `  - ${p}`), '');

    const snags = job.snags ?? [];
    lines.push(snags.length || job.snagOverflow ? `Snags (${snags.length}${job.snagOverflow ? ` shown, ${job.snagOverflow} more not listed` : ''}):` : 'No snags.');
    snags.forEach((snag, i) => {
        lines.push(`${i + 1}. [${snag.kind}] ${snag.message}`);
        if (snag.src) lines.push(`     source: ${snag.src}`);
        if (snag.dest) lines.push(`     destination: ${snag.dest}`);
    });

    if (job.privateReport?.length) {
        lines.push('', 'Private threads filed separately (admin-only information):');
        for (const entry of job.privateReport) {
            const members = entry.membersKnown ? (entry.memberIds.map(id => `<@${id}>`).join(', ') || 'none') : 'unknown';
            lines.push(`${entry.n}. "${entry.originalName}" → ${threadLink(job.guildId, entry.threadId)} — original members: ${members}`);
        }
    }
    return lines.join('\n');
}

function buildProceedModal(job) {
    const lost = job.lost?.count ?? 0;
    const title = lost ? `Delete channel — ${lost} file(s) lost` : 'Delete the original channel';
    const input = new TextInputBuilder()
        .setCustomId('confirmName')
        .setLabel('Type the channel name to confirm')
        .setPlaceholder(job.targetName.slice(0, 100))
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    return new ModalBuilder()
        .setCustomId(customId(job.id, 'proceedModal'))
        .setTitle(title.slice(0, 45))
        .addComponents(new ActionRowBuilder().addComponents(input));
}

function completionNote(job) {
    const lines = [
        `✅ **#${job.targetName}** was filed and deleted. Filed copy: ${threadLink(job.guildId, job.mainThreadId)}`,
    ];
    if (job.privateReport?.length) {
        lines.push(
            '',
            `🔒 **${job.privateReport.length} private thread(s) were filed separately.** Please investigate each one and add the appropriate people, keeping them private. (Adding members needs someone with Manage Threads.)`,
        );
        for (const entry of job.privateReport) {
            const members = entry.membersKnown ? (entry.memberIds.map(id => `<@${id}>`).join(', ') || 'none') : 'unknown';
            lines.push(`${entry.n}. ${threadLink(job.guildId, entry.threadId)} — "${entry.originalName}" — original members: ${members}`);
        }
    }
    return lines.join('\n');
}

module.exports = {
    GREEN,
    ORANGE,
    RED,
    customId,
    threadLink,
    buildReviewMessage,
    buildBusyMessage,
    stuckMessage,
    buildReport,
    buildProceedModal,
    completionNote,
};
