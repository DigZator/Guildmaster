module.exports = async (interaction, client) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.channel.name !== 'test-in') {
        await interaction.reply({
            content: '❌ This command can only be used in #test-in!',
            flags: 64
        });
        return;
    }

    if (!client.announcementSessions) {
        client.announcementSessions = new Map();
    }

    client.announcementSessions.set(interaction.user.id, {
        step: 'awaiting_message',
        channelId: interaction.channel.id
    });

    await interaction.reply({
        content: '📝 **Game Announcement - Step 1/2**\n\n' +
                 'Please send your announcement message wrapped in triple backticks (```).\n\n' +
                 '**Example:**\n' +
                 '\\`\\`\\`\n' +
                 '*Game Night*\n' +
                 '_Friday 8 PM_\n' +
                 '\\`\\`\\`',
        flags: 64
    });
};