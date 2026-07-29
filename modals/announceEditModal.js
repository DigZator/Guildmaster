const { buildAnnouncementEmbed, buildWhatsApp, italizeBlurb, bulletizeNotes, getPreviewButtons, setSessionTimeout } = require('../utils/announcementHelper');
const { sessions } = require('../utils/sessionStore');

module.exports = async (interaction, client) => {
    // customId shape: announceedit_modal_<userId>_<field>
    const field = interaction.customId.slice('announceedit_modal_'.length + interaction.user.id.length + 1);

    const session = sessions.get(interaction.user.id);
    if (!session) {
        await interaction.reply({ content: '❌ Session expired.', flags: 64 });
        return;
    }

    const newValue = interaction.fields.getTextInputValue('value').trim();

    let processedVal = newValue;
    if (field === 'blurb') {
        processedVal = italizeBlurb(newValue);
    } else if (field === 'notes') {
        processedVal = bulletizeNotes(newValue);
    }

    session.game[field] = processedVal;
    session.editingField = null;
    session.step = null;
    setSessionTimeout(interaction.user.id, 600000);

    session.embed = buildAnnouncementEmbed(session.game, interaction.guild);
    session.whatsapp = buildWhatsApp(session.game);

    await interaction.update({
        content: `✅ Updated! Here's the new preview:`,
        embeds: [session.embed],
        components: [getPreviewButtons()]
    });
};
