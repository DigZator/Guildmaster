const { ChannelType } = require('discord.js');

const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const THREAD = [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread];
const FORUM = [ChannelType.GuildForum];
const CATEGORY = [ChannelType.GuildCategory];
const SEND = ['ViewChannel', 'SendMessages'];
const MAKE_CHANNELS = ['ViewChannel', 'ManageChannels'];

const envFix = (key) => `Set \`${key}\` in .env, then restart the bot.`;
const gateFix = (key) => `Permission gate: set \`${key}\` in .env, then restart the bot.`;

const ticket = (field) => () => require('./ticketGuildConfig').getConfig()[field] || null;

const definitions = [
    { key: 'BOT_LOG_CHANNEL_ID', label: 'Bot log', tier: 'core', types: TEXT, needs: SEND, usedBy: 'logs, alerts and trap channel reports' },
    { key: 'GUILDMASTER_CTRL_CHANNEL_ID', label: 'Guildmaster control', tier: 'core', gate: true, types: TEXT, needs: SEND, usedBy: 'admin checks and error reports' },
    { key: 'LEAGUE_ADMIN_CHANNEL_ID', label: 'League admin', tier: 'feature', gate: true, types: TEXT, needs: SEND, usedBy: 'league admin checks and dashboards' },
    { key: 'TRAP_CHANNEL_ID', label: 'Trap channel', tier: 'feature', types: TEXT, needs: ['ViewChannel', 'ManageMessages'], usedBy: 'trap channel (kicks anyone who posts)' },
    { key: 'INCIDENT_REPORT_CHANNEL_ID', label: 'Incident reports', tier: 'feature', types: TEXT, needs: SEND, usedBy: 'trap channel incident reports' },
    { key: 'QUEST_BOARD_CHANNEL_ID', label: 'Quest board', tier: 'feature', types: TEXT, needs: SEND, usedBy: 'game announcements and the scheduler', skipInDev: true },
    { key: 'BOT_DEBUGGING_CHANNEL_ID', label: 'Bot debugging', tier: 'feature', types: TEXT, needs: SEND, usedBy: 'debug output; replaces the quest board and control channel in DEV_MODE' },
    { key: 'THE_LONG_REST_CHANNEL_ID', label: 'The Long Rest', tier: 'feature', types: TEXT, needs: SEND, usedBy: 'The Long Rest memorials' },
    { key: 'TLR_CONTROL_CHANNEL_ID', label: 'The Long Rest control', tier: 'feature', types: TEXT, needs: SEND, usedBy: 'The Long Rest moderation' },
    { key: 'TLR_SUBMISSION_CHANNEL_ID', label: 'The Long Rest submissions', tier: 'feature', types: TEXT, needs: ['ViewChannel'], usedBy: 'The Long Rest submissions' },
    { key: 'FEEDS_CHANNEL_ID', label: 'RSS feeds', tier: 'feature', types: TEXT, needs: SEND, usedBy: '/rss feeds' },
    { key: 'LEAGUE_PROFILES_FORUM_ID', label: 'League profiles forum', tier: 'feature', types: FORUM, needs: SEND, usedBy: 'character profile threads' },
    { key: 'LEAGUE_ART_ARCHIVE_THREAD_ID', label: 'Character art archive thread', tier: 'feature', types: THREAD, needs: ['ViewChannel', 'SendMessagesInThreads'], usedBy: 'character art storage' },
    { key: 'ARCHIVE_CATEGORY_ID', label: 'Archive category', tier: 'feature', types: CATEGORY, needs: MAKE_CHANNELS, usedBy: '/archive', managed: true, fix: 'Run `/archive-config`.', read: () => require('./archiveConfig').getArchiveCategoryId() },
    { key: 'TICKET_CATEGORY_ID', label: 'Ticket category', tier: 'feature', types: CATEGORY, needs: MAKE_CHANNELS, usedBy: 'tickets', managed: true, fix: 'Run `/ticket config`.', read: ticket('categoryId') },
    { key: 'HR_TICKET_CATEGORY_ID', label: 'HR ticket category', tier: 'feature', types: CATEGORY, needs: MAKE_CHANNELS, usedBy: 'HR tickets', managed: true, fix: 'Run `/ticket config`.', read: ticket('hrCategoryId') },
    { key: 'TICKET_LOG_CHANNEL_ID', label: 'Ticket log', tier: 'feature', types: TEXT, needs: SEND, usedBy: 'ticket logs', managed: true, fix: 'Run `/ticket config`.', read: ticket('logChannelId') },
    { key: 'HR_TICKET_LOG_CHANNEL_ID', label: 'HR ticket log', tier: 'feature', types: TEXT, needs: SEND, usedBy: 'HR ticket logs', managed: true, fix: 'Run `/ticket config`.', read: ticket('hrLogChannelId') },
];

const MAPPINGS = definitions.map((entry) => Object.freeze({
    gate: false,
    managed: false,
    skipInDev: false,
    read: () => process.env[entry.key] || null,
    ...entry,
    fix: entry.fix || (entry.gate ? gateFix(entry.key) : envFix(entry.key)),
}));

module.exports = { MAPPINGS };
