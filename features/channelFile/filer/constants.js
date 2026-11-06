const { ChannelType } = require('discord.js');

const SEND_ATTEMPTS = 4;
const FETCH_ATTEMPTS = 4;
const RETRY_BASE_MS = 1500;
const DOWNLOAD_TIMEOUT_MS = 60 * 1000;
const MAX_SNAGS = 200;
const PROGRESS_INTERVAL_MS = 10 * 1000;

const BATCH_SIZE = 64;
const BATCH_CHECK_ATTEMPTS = 3;
const BATCH_CHECK_RETRY_MS = Number(process.env.CHANNEL_FILE_BATCH_RETRY_MS) || 2000;
const NO_MESSAGES_TYPES = [ChannelType.GuildForum, ChannelType.GuildMedia];
const ALLOWED_MENTIONS = { parse: [] };

module.exports = {
    SEND_ATTEMPTS,
    FETCH_ATTEMPTS,
    RETRY_BASE_MS,
    DOWNLOAD_TIMEOUT_MS,
    MAX_SNAGS,
    PROGRESS_INTERVAL_MS,
    BATCH_SIZE,
    BATCH_CHECK_ATTEMPTS,
    BATCH_CHECK_RETRY_MS,
    NO_MESSAGES_TYPES,
    ALLOWED_MENTIONS,
};
