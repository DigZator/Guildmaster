const TLR_MOD_ROLE_IDS = [process.env.ADMINS_ROLE_ID, process.env.CLERK_OF_MORTAL_AFFAIRS_ROLE_ID].filter(Boolean);

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.channel.name !== 'tlr-submission') return;
        
        if (message.channel.isThread()) return;

        if (message.content.startsWith('/')) return;

        const isValid = TLR_MOD_ROLE_IDS.length > 0 && message.member.roles.cache.some(r => TLR_MOD_ROLE_IDS.includes(r.id));
        
        if (!isValid) {
            try {
                await message.delete();
            } catch (error) {
                console.log('Could not delete message:', error);
            }
        }
    });
};
