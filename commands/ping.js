module.exports = async (interaction) => {
    await interaction.reply({
        content: 'Pong! 🏓'
    });

    setTimeout(async () => {
        try {
            await interaction.deleteReply();
        } catch (error) {
            console.error('Could not delete ping reply:', error);
        }
    }, 5000);
};