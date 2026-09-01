const { buildRemoveConfirmation } = require('../utils/tlrRemoveFlow');

module.exports = async (interaction) => {
    const messageId = interaction.values[0];

    await interaction.deferUpdate();

    const { payload } = await buildRemoveConfirmation(interaction, messageId);
    await interaction.editReply(payload);
};
