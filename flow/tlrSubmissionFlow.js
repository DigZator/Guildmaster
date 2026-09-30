const { TLR_SUBMISSION_CHANNEL_ID } = require('../data/channels');
const { isTlrMod } = require('../config/tlrRoles');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!TLR_SUBMISSION_CHANNEL_ID || message.channelId !== TLR_SUBMISSION_CHANNEL_ID) return;

        if (message.channel.isThread()) return;

        if (message.content.startsWith('/')) return;

        if (!isTlrMod(message.member)) {
            try {
                await message.delete();
            } catch (error) {
                console.log('Could not delete message:', error);
            }
        }
    });
};
