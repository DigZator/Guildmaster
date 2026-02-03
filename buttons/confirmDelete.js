module.exports = async (interaction, client) => {
    const messageId = interaction.customId.replace('confirm_remove_', '');

    const outputChannel = interaction.guild.channels.cache.find(
        channel => channel.name === 'the-long-rest'
    );

    if (!outputChannel) {
        await interaction.reply({
            content: 'Output channel not found. Contact an admin.',
            flags: 64
        });
        return;
    }

    let message;
    try {
        message = await outputChannel.messages.fetch(messageId);
    } catch (error) {
        console.error('Error fetching message:', error);
        await interaction.reply({
            content: 'Message not found. It may have already been deleted.',
            flags: 64
        });
        return;
    }

    const footerText = message.embeds[0]?.footer?.text || '';
    const authorIdMatch = footerText.match(/AuthorID:\s*(\d{17,19})/);
    const authorId = authorIdMatch ? authorIdMatch[1] : null;

    const isAuthor = authorId === interaction.user.id;
    const isMod  = interaction.member.roles.cache.some(
        role => role.name === 'Mods'
    );
    if (!isAuthor && !isMod) {
        await interaction.reply({
            content: 'You do not have permission to delete this message.',
            flags: 64
        });
        return;
    }

    await message.delete();

    if(message.hasThread){
        try{
            const thread = message.thread;
            await thread.delete();
        }   catch (err) {
            console.log("Could not delete thread:", err);
        }
    }
    await interaction.reply({
        content: 'Message successfully deleted.',
        flags: 64
    });
};