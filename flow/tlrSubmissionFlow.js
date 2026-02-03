module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.channel.name !== 'tlr-submission') return;
        
        if (message.channel.isThread()) return;

        if (message.content.startsWith('/')) return;

        const allowedRole =['Mods', 'Clerk of Mortal Affairs'];
        
        const isValid = message.member.roles.cache.some(
            role => allowedRole.includes(role.name)
        );
        
        if (!isValid) {
            try {
                await message.delete();
            } catch (error) {
                console.log('Could not delete message:', error);
            }
        }
    });
};