const { GUILDMASTER_CTRL_CHANNEL_ID, LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

const ADMINS_ROLE_ID = process.env.ADMINS_ROLE_ID;

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
};

function hasAdminRole(interaction, type) {
    const roleIds = ADMIN_CONFIG[type]?.roleIds || [];
    if (roleIds.length === 0) return false;
    return interaction.member?.roles?.cache?.some(r => roleIds.includes(r.id)) ?? false;
}

function inAdminChannel(interaction, type) {
    const channels = ADMIN_CONFIG[type]?.channels || [];
    return channels.includes(interaction.channel.id);
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

module.exports = { isAdminChannel, isAdmin: isAdminChannel, ADMIN_CONFIG };
