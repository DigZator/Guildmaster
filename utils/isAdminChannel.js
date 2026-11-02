const { GUILDMASTER_CTRL_CHANNEL_ID, LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

const ADMINS_ROLE_ID = process.env.ADMINS_ROLE_ID;
const HR_ROLE_ID = process.env.HR_ROLE_ID;
const CMD_ROLE_ID = process.env.CMD_ROLE_ID;

if (!CMD_ROLE_ID) {
    console.warn('[isAdminChannel] CMD_ROLE_ID is not set — the "cmd" check will deny everyone.');
}

const ADMIN_CONFIG = {
    bot: {
        mode: process.env.ADMIN_CHECK_MODE_BOT || 'either',
        channels: [GUILDMASTER_CTRL_CHANNEL_ID],
        roleIds: [ADMINS_ROLE_ID].filter(Boolean),
    },
    league: {
        mode: process.env.ADMIN_CHECK_MODE_LEAGUE || 'either',
        channels: [LEAGUE_ADMIN_CHANNEL_ID, GUILDMASTER_CTRL_CHANNEL_ID],
        roleIds: [ADMINS_ROLE_ID].filter(Boolean),
    },
    botAdmin: {
        mode: 'role',
        channels: [],
        roleIds: [ADMINS_ROLE_ID].filter(Boolean),
    },
    botChannelAdmin: {
        mode: 'both',
        channels: [GUILDMASTER_CTRL_CHANNEL_ID],
        roleIds: [ADMINS_ROLE_ID].filter(Boolean),
    },
    hr: {
        mode: 'role',
        channels: [],
        roleIds: [HR_ROLE_ID].filter(Boolean),
    },
    cmd: {
        mode: 'role',
        channels: [],
        roleIds: [CMD_ROLE_ID].filter(Boolean),
    },
};

function hasAdminRole(interaction, type) {
    const roleIds = ADMIN_CONFIG[type]?.roleIds || [];
    if (roleIds.length === 0) return false;
    return interaction.member?.roles?.cache?.some(r => roleIds.includes(r.id)) ?? false;
}

// The ids this interaction counts as being "in": its own channel, plus the parent channel when it happens
// inside a thread. channelId is always present on an interaction, so an uncached channel no longer throws.
function currentChannelIds(interaction) {
    const ids = [];
    const id = interaction.channelId ?? interaction.channel?.id;
    if (id) ids.push(id);
    const channel = interaction.channel;
    if (channel?.isThread?.() && channel.parentId) ids.push(channel.parentId);
    return ids;
}

function inAdminChannel(interaction, type) {
    const channels = ADMIN_CONFIG[type]?.channels || [];
    return currentChannelIds(interaction).some(id => channels.includes(id));
}

function isAdminChannel(interaction, type = 'bot') {
    const cfg = ADMIN_CONFIG[type];
    if (!cfg) {
        console.warn(`[isAdminChannel] Unknown admin check type "${type}", defaulting to deny.`);
        return false;
    }

    switch (cfg.mode) {
        case 'role':
            return hasAdminRole(interaction, type);
        case 'either':
            return hasAdminRole(interaction, type) || inAdminChannel(interaction, type);
        case 'both':
            return hasAdminRole(interaction, type) && inAdminChannel(interaction, type);
        case 'channel':
        default:
            return inAdminChannel(interaction, type);
    }
}

module.exports = { isAdminChannel, ADMIN_CONFIG, HR_ROLE_ID, ADMINS_ROLE_ID, CMD_ROLE_ID };
