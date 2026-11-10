// The transcript engine shared by tickets, direct lines and /channel_file: it turns a channel's history into
// transcript messages and reposts the attachments. This file only re-exports; the pieces live beside it.
const { renderHistory } = require('./history');
const { buildHeaderLines, chunkLines } = require('./chunks');
const { uploadLimitBytes, MIN_FREE_DISK_BYTES } = require('./limits');
const { freeDiskBytes } = require('./staging');
const { formatStamp } = require('./format');
const { buildTranscript } = require('./build');
const { postAttachmentGroups, sendTranscript } = require('./post');

module.exports = {
    renderHistory,
    buildHeaderLines,
    chunkLines,
    uploadLimitBytes,
    freeDiskBytes,
    formatStamp,
    buildTranscript,
    postAttachmentGroups,
    sendTranscript,
    MIN_FREE_DISK_BYTES,
};
