const { updateGameProperties } = require('../utils/notion');
const { invalidateCache } = require('../utils/cache');
const editGameSession = require('../utils/editGameSession');
const { parseDateFromInput } = require('../utils/dateFormat');

function formatValue(fieldType, raw) {
    switch (fieldType) {
        case 'title':
            return { title: [{ text: { content: raw } }] };

        case 'rich_text':
            return { rich_text: [{ text: { content: raw } }] };

        case 'number': {
            const num = parseFloat(raw);
            if (isNaN(num)) throw new Error(`Expected a number but got: \`${raw}\``);
            return { number: num };
        }

        case 'checkbox': {
            const val = raw.toLowerCase();
            if (val !== 'true' && val !== 'false') throw new Error(`Expected \`true\` or \`false\` but got: \`${raw}\``);
            return { checkbox: val === 'true' };
        }

        case 'url':
            return { url: raw };

        case 'select':
            return { select: { name: raw } };

        case 'multi_select': {
            const items = raw.split(',').map(s => ({ name: s.trim() })).filter(o => o.name);
            return { multi_select: items };
        }

        case 'date':
            return { date: { start: parseDateFromInput(raw) } };

        case 'files':
            return { files: [{ name: raw, external: { url: raw } }] };

        default:
            throw new Error(`Unsupported field type: \`${fieldType}\``);
    }
}

module.exports = async (interaction, client) => {
    const session = editGameSession.get(interaction.user.id);

    if (!session) {
        await interaction.reply({ content: '❌ Session expired. Run `/edit_game` again.', flags: 64 });
        return;
    }

    const raw = interaction.fields.getTextInputValue('value').trim();

    try {
        const formattedValue = formatValue(session.fieldType, raw);
        const properties = { [session.fieldName]: formattedValue };

        await updateGameProperties(session.gameId, properties);
        invalidateCache();
        editGameSession.remove(interaction.user.id);

        await interaction.reply({
            content: `✅ **${session.fieldName}** updated for **${session.gameName}**.`,
            flags: 64,
        });
    } catch (error) {
        console.error('[editGameModal] Error:', error);
        await interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
    }
};
