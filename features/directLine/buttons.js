const auth = require('../../shared/auth');
const directLineStore = require('./store');
const directLineFlow = require('./flow');
const { decodeId } = require('./directLineId');
const { EPHEMERAL } = require('../../shared/utilities/ephemeral');

function denyMessage() {
    return { content: '❌ Only HR can do that.', flags: EPHEMERAL };
}

function outOfDateText(record) {
    return record
        ? `⚠️ That button is out of date — this direct line is ${directLineFlow.describeStatus(record.status)}.`
        : '❌ This direct line record no longer exists.';
}

function formatWarnings(warnings = []) {
    return warnings.length ? `\n${warnings.map(w => `⚠️ ${w}`).join('\n')}` : '';
}

async function handleDirectLineButton(interaction) {
    const { dlId, action } = decodeId(interaction.customId);
    const record = directLineStore.getDirectLineById(dlId);

    if (!record) {
        return interaction.reply({ content: '❌ This direct line record no longer exists.', flags: EPHEMERAL });
    }

    if (!auth.can('hr', interaction)) {
        return interaction.reply(denyMessage());
    }

    switch (action) {
        case 'fileYes': {
            if (record.status !== 'open') {
                return interaction.update({ content: outOfDateText(record), components: [] });
            }

            await interaction.deferUpdate();
            const result = await directLineFlow.finalizeFile(interaction, record);

            if (!result.ok) {
                if (result.reason === 'status' || result.reason === 'missing') {
                    return interaction.editReply({ content: outOfDateText(result.record ?? directLineStore.getDirectLineById(dlId)), components: [] });
                }
                return interaction.editReply({ content: result.message, components: [] });
            }

            return interaction.editReply({ content: `✅ Direct line filed and channel removed.${formatWarnings(result.warnings)}`, components: [] });
        }
        case 'fileNo':
            return directLineFlow.cancelFile(interaction);
        default:
            return interaction.reply({ content: '❌ This control isn\'t wired up yet.', flags: EPHEMERAL });
    }
}

module.exports = {
    prefix: {
        'dl:': handleDirectLineButton,
    },
};
