const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

function isAdminChannel(interaction) {
    const allowed = [GUILDMASTER_CTRL_CHANNEL_ID];
    return allowed.includes(interaction.channel.id);
}

module.exports = { isAdminChannel };
