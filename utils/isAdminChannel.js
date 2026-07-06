const { GUILDMASTER_CTRL_CHANNEL_ID, LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

function isAdminChannel(interaction, type = 'bot') {
	const channelMap = {
		bot: [GUILDMASTER_CTRL_CHANNEL_ID],
		league: [LEAGUE_ADMIN_CHANNEL_ID, GUILDMASTER_CTRL_CHANNEL_ID],
	};
    return channelMap[type].includes(interaction.channel.id);
}

module.exports = { isAdminChannel };
