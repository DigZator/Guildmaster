const { updateGameProperties } = require('../utils/notion');
const { invalidateCache } = require('../utils/cache');
const editGameSession = require('../utils/editGameSession');

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
            const items = raw.split(',').map(s => ({ name: s.trim() }));
            return { multi_select: items };
        }

        case 'date':
            return { date: { start: new Date(raw).toISOString() } };

        case 'files':
            return { files: [{ name: raw, external: { url: raw } }] };

        default:
            throw new Error(`Unsupported field type: \`${fieldType}\``);
    }
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!editGameSession.has(message.author.id)) return;

        const session = editGameSession.get(message.author.id);

        if (message.channelId !== message.channel.id) return;

        const match = message.content.match(/```([\s\S]*?)```/);

        if (!match) {
            const reply = await message.reply('❌ Please wrap your new value in triple backticks.');
            setTimeout(() => reply.delete().catch(() => {}), 10000);
            return;
        }

        const raw = match[1].trim();

        try {
            const formattedValue = formatValue(session.fieldType, raw);
            const properties = { [session.fieldName]: formattedValue };

            await updateGameProperties(session.gameId, properties);
            invalidateCache();
            editGameSession.remove(message.author.id);

            try { await message.delete(); } catch {}

            await message.channel.send(
                `<@${message.author.id}> ✅ **${session.fieldName}** updated for **${session.gameName}**.`
            );

        } catch (error) {
            console.error('[editGameFlow] Error:', error);
            const reply = await message.reply(`❌ ${error.message}`);
            setTimeout(() => reply.delete().catch(() => {}), 15000);
        }
    });
};
