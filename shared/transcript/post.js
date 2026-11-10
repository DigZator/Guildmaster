const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { AttachmentBuilder } = require('discord.js');
const { MEMORY_BATCH_MAX_BYTES, MIN_FREE_DISK_BYTES, uploadLimitBytes } = require('./limits');
const { mapLimit, stageBuffer, stageFile, estimatedSize, packBatches, freeDiskBytes } = require('./staging');

// Posting a transcript and its attachments to a thread.

const TEMP_ROOT = path.join(__dirname, '../../temp');

const DOWNLOAD_CONCURRENCY = 3;

async function postAttachmentGroups(thread, groups, {
    initialNotPreserved = [],
    send = payload => thread.send(payload),
    tempDir,
    refreshUrl,
    download,
    fetchBuffer: fetcher,
    retryBaseMs,
    timeoutMs,
    header = true,
} = {}) {
    const allowedMentions = { parse: [] };
    const workDir = tempDir ?? path.join(TEMP_ROOT, `transcript-${randomUUID()}`);
    const notPreserved = [...initialNotPreserved];
    const failures = [];
    const limit = uploadLimitBytes(thread.guild);
    let reposted = 0;

    const fail = (file, reason) => {
        notPreserved.push(`${file.name} (${reason})`);
        failures.push({ file, reason });
    };

    if (header && groups.length) {
        try {
            await send({ content: '### 📎 Attachments', allowedMentions });
        } catch (err) {
            console.warn('[ticketTranscript] Could not post attachments header:', err.message);
        }
    }

    for (const group of groups) {
        const batches = packBatches(group.files, limit);

        for (let i = 0; i < batches.length; i++) {
            const label = i === 0 ? group.label : `${group.label} (continued)`;
            const batch = batches[i];
            const useDisk = batch.reduce((sum, file) => sum + estimatedSize(file), 0) > MEMORY_BATCH_MAX_BYTES;

            if (useDisk && freeDiskBytes(path.dirname(workDir)) < MIN_FREE_DISK_BYTES + limit) {
                for (const file of batch) fail(file, 'not enough free disk space');
                continue;
            }
            if (useDisk) fs.mkdirSync(workDir, { recursive: true });

            const staged = await mapLimit(batch, DOWNLOAD_CONCURRENCY, async (file, n) => {
                try {
                    const common = { refreshUrl, retryBaseMs, maxBytes: limit, timeoutMs };
                    return useDisk
                        ? { file, filePath: await stageFile(file, workDir, `${i}-${n}`, { ...common, download }) }
                        : { file, buffer: await stageBuffer(file, { ...common, fetchBuffer: fetcher }) };
                } catch (error) {
                    return { file, error };
                }
            });

            const ready = [];
            for (const item of staged) {
                if (item.error) {
                    console.warn(`[ticketTranscript] Could not download ${item.file.name}:`, item.error.message);
                    fail(item.file, 'download failed');
                } else {
                    ready.push(item);
                }
            }

            try {
                if (!ready.length) continue;

                const toAttachment = ({ file, filePath, buffer }) => new AttachmentBuilder(filePath ?? buffer, { name: file.name });

                try {
                    await send({ content: label, files: ready.map(toAttachment), allowedMentions });
                    reposted += ready.length;
                } catch (err) {
                    console.warn('[ticketTranscript] Batch upload failed, retrying individually:', err.message);
                    for (const item of ready) {
                        try {
                            await send({ content: label, files: [toAttachment(item)], allowedMentions });
                            reposted += 1;
                        } catch (singleErr) {
                            console.warn(`[ticketTranscript] Could not upload ${item.file.name}:`, singleErr.message);
                            fail(item.file, 'upload failed');
                        }
                    }
                }
            } finally {
                for (const { filePath } of ready) if (filePath) fs.rmSync(filePath, { force: true });
            }
        }
    }

    fs.rmSync(workDir, { recursive: true, force: true });

    if (notPreserved.length) {
        const list = notPreserved.map(entry => `• ${entry}`).join('\n');
        try {
            await send({ content: `### ⚠️ Not preserved\n${list}`.slice(0, 2000), allowedMentions });
        } catch (err) {
            console.warn('[ticketTranscript] Could not post the not-preserved list:', err.message);
        }
    }

    return { reposted, notPreserved, failures };
}

async function sendTranscript(thread, transcript, options = {}) {
    const allowedMentions = { parse: [] };

    for (const chunk of transcript.chunks) {
        await thread.send({ content: chunk, allowedMentions });
    }

    const { reposted, notPreserved } = await postAttachmentGroups(thread, transcript.attachmentGroups, {
        ...options,
        initialNotPreserved: transcript.notPreserved,
    });

    return { reposted, notPreserved };
}

module.exports = { postAttachmentGroups, sendTranscript };
