const { applyPick } = require('../utils/starterEquipmentFlow');
const starterItemsButtons = require('../buttons/starterItems');

module.exports = async function starterItemsSelect(interaction) {
    const messageId = interaction.message.id;
    const session = starterItemsButtons.__sessions?.get(messageId);

    if (!session) {
        return interaction.update({ content: '❌ Session expired.', embeds: [], components: [] });
    }

    await interaction.deferUpdate();

    const pickIndex = parseInt(interaction.values[0], 10);
    try {
        applyPick(session, pickIndex);
    } catch (err) {
        console.error('[starterItemsSelect] applyPick failed:', err);
        await interaction.editReply({ content: '❌ Something went wrong with that choice.', embeds: [], components: [] });
        return;
    }

    await starterItemsButtons.renderStep(interaction, session);
};
