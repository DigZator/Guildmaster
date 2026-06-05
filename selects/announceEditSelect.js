const { sessions } = require('../utils/sessionStore');

module.exports = async (interaction, client) => {
    const field = interaction.values[0];
    const session = sessions.get(interaction.user.id);

    if (!session) {
        await interaction.reply({ content: '❌ Session expired.', flags: 64 });
        return;
    }

    const fieldLabels = {
        title: 'Title',
        blurb: 'Blurb',
        dm: 'DM',
        system: 'System',
        date: 'Date',
        time: 'Time',
        location: 'Location / Venue',
        classes: 'Classes Allowed',
        species: 'Species Allowed',
        level: 'Level',
        experienceLevel: 'Experience Level',
        warnings: 'Content Warnings',
        notes: 'Other Notes',
        artist: 'Art Credits',
        artURL: 'Cover Art',
        registrationLink: 'Registration Link',
        price: 'Price',
        rline: 'Register Line',
    };

    session.editingField = field;
    session.step = field === 'artURL' ? 'awaiting_art' : 'awaiting_edit';

    const currentValue = session.game[field] || 'None';

    if (field === 'artURL') {
        await interaction.update({
            content: `🖼️ **Editing: Cover Art**\n\nPlease upload an image in this channel.`,
            components: []
        });
    } else {
        await interaction.update({
            content: `✏️ **Editing: ${fieldLabels[field]}**\n\n**Current value:**\n\`\`\`\n${currentValue}\n\`\`\`\n\nSend the new value wrapped in backticks.`,
            components: []
        });
    }
};
