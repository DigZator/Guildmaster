const { uploadLimitBytes } = require('./limits');
const { fetchFullHistory, renderHistory } = require('./history');
const { buildHeaderLines, chunkLines } = require('./chunks');

// ─── Public API ─────────────────────────────────────────────────────────────
async function buildTranscript(channel, { header, meta, closeReason, closeFeedback, preserveAttachments = false, maxAttachments } = {}) {
    const history = await fetchFullHistory(channel);
    const maxFileBytes = uploadLimitBytes(channel.guild);
    const rendered = renderHistory(history, { preserveAttachments, maxFileBytes, maxAttachments });

    const lines = [...buildHeaderLines({ header, meta, closeReason, closeFeedback }), ...rendered.lines];

    return {
        chunks: chunkLines(lines),
        attachmentGroups: rendered.attachmentGroups,
        notPreserved: rendered.notPreserved,
    };
}

module.exports = { buildTranscript };
