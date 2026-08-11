const { parseDateFromInput } = require('./dateFormat');

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

module.exports = { formatValue };
