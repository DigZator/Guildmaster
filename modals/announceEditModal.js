const { buildAnnouncementEmbed, buildWhatsApp, italizeBlurb, bulletizeNotes, getPreviewButtons, setSessionTimeout } = require('../utils/announcementHelper');
const { sessions } = require('../utils/sessionStore');
const { syncAnnouncementFieldToNotion, UNSYNCED_FIELDS } = require('../utils/announcementNotionSync');
const { invalidateCache } = require('../utils/cache');

module.exports = async (interaction, client) => {
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

    const syncResult = await syncAnnouncementFieldToNotion(session.game, field, processedVal);
    if (syncResult.synced) {
        invalidateCache();
    }

    let content = `✅ Updated! Here's the new preview:`;
    if (!syncResult.synced) {
        if (UNSYNCED_FIELDS.has(field)) {
            content += `\n⚠️ Note: **Date/Time** can't be auto-synced to Notion (they're calculated fields there) — this only updates the announcement preview. Edit **Start Date** via \`/edit_game\` if the underlying date needs to change.`;
        } else if (syncResult.reason === 'notion_error') {
            content += `\n⚠️ This preview updated, but I couldn't save the change to Notion — the two are now out of sync. Try again or use \`/edit_game\`.`;
        }
    }

    await interaction.update({
        content,
        embeds: [session.embed],
        components: [getPreviewButtons()]
    });
};
