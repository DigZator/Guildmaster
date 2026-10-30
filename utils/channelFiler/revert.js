const jobsStore = require('../channelFileJobs');
const { abortedName } = require('./destination');
const { unfreezeTarget } = require('./freeze');

// ─── Hard revert ────────────────────────────────────────────────────────────
async function hardRevert(client, jobId, reason) {
    const job = jobsStore.getJob(jobId);
    if (!job) return { ok: true, problems: [], threads: [] };

    await jobsStore.updateJob(jobId, { phase: jobsStore.PHASES.aborting }).catch(() => {});

    const problems = await unfreezeTarget(client, job);

    const threads = [];
    for (const created of job.createdThreads ?? []) {
        try {
            const thread = await client.channels.fetch(created.id);
            if (!thread.name.startsWith('aborted · ')) await thread.setName(abortedName(thread.name));
            threads.push(created.id);
        } catch (err) {
            if (err.status !== 404) problems.push(`Could not mark <#${created.id}> as aborted: ${err.message}`);
        }
    }

    if (problems.length) {
        await jobsStore.updateJob(jobId, { phase: jobsStore.PHASES.review, failed: reason, revertProblems: problems }).catch(() => {});
    } else {
        await jobsStore.removeJob(jobId);
    }

    return { ok: problems.length === 0, problems, threads };
}

module.exports = {
    hardRevert,
};
