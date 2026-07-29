const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { sessions } = require('../utils/sessionStore');

const MAX_MODAL_VALUE_LENGTH = 4000;

const fieldLabels = {
    title: 'Title',
    blurb: 'Blurb',
    dm: 'DM',
    system: 'System',
    date: 'Date',
    time: 'Time',
    rline: 'Register Line',
    registrationLink: 'Registration Link',
    notes: 'Other Notes',
    location: 'Location / Venue',
    classes: 'Classes Allowed',
    species: 'Species Allowed',
    level: 'Level',
    experienceLevel: 'Experience Level',
    warnings: 'Content Warnings',
    artist: 'Art Credits',
    artURL: 'Cover Art',
    price: 'Price',
};

module.exports = async (interaction, client) => {
    const field = interaction.values[0];
    const session = sessions.get(interaction.user.id);

    if (!session) {
        await interaction.reply({ content: '❌ Session expired.', flags: 64 });
        return;
    }

    if (field === 'artURL') {
        session.editingField = field;
        session.step = 'awaiting_art';

        await interaction.update({
            content: `🖼️ **Editing: Cover Art**\n\nPlease upload an image in this channel.`,
            components: []
        });
        return;
    }

    const currentValue = session.game[field] ?? '';

    const modal = new ModalBuilder()
        .setCustomId(`announceedit_modal_${interaction.user.id}_${field}`)
        .setTitle(`Edit: ${fieldLabels[field] ?? field}`.slice(0, 45));

    const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel((fieldLabels[field] ?? field).slice(0, 45))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

    if (currentValue !== '') {
        input.setValue(String(currentValue).slice(0, MAX_MODAL_VALUE_LENGTH));
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal);
};
