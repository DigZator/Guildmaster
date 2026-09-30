const { isAdminChannel } = require('../utils/isAdminChannel');
const directLineStore = require('../utils/directLineStore');
const directLineFlow = require('../flow/directLineFlow');
const { decodeId } = require('../interactions/directLineId');

function denyMessage() {
    return { content: '❌ Only HR can do that.', flags: 64 };
}

async function handleDirectLineButton(interaction) {
    const { dlId, action } = decodeId(interaction.customId);
    const record = directLineStore.getDirectLineById(dlId);

    if (!record) {
        return interaction.reply({ content: '❌ This direct line record no longer exists.', flags: 64 });
    }

    if (!isAdminChannel(interaction, 'hr')) {
        return interaction.reply(denyMessage());
    }

    switch (action) {
        case 'fileYes': {
            await interaction.deferUpdate();
            const result = await directLineFlow.finalizeFile(interaction, record);
            if (result) await interaction.editReply({ content: '✅ Direct line filed and channel removed.', components: [] });
            return;
        }
        case 'fileNo':
            return directLineFlow.cancelFile(interaction);
        default:
            return interaction.reply({ content: '❌ This control isn\'t wired up yet.', flags: 64 });
    }
}

module.exports = {
    prefix: {
        'dl:': handleDirectLineButton,
    },
};
