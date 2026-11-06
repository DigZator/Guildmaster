let ticketCommandId = null;

async function init(client) {
    client.once('clientReady', async () => {
        try {
            const guildId = process.env.GUILD_ID;
            const guildCommands = guildId
                ? await (await client.guilds.fetch(guildId)).commands.fetch()
                : null;
            const globalCommands = guildCommands?.find(c => c.name === 'ticket')
                ? null
                : await client.application.commands.fetch();
            const cmd = guildCommands?.find(c => c.name === 'ticket') ?? globalCommands?.find(c => c.name === 'ticket');
            ticketCommandId = cmd?.id ?? null;
            if (!ticketCommandId) console.warn('[ticketCommands] /ticket command not found — mentions will be plain text.');
        } catch (err) {
            console.warn('[ticketCommands] Could not resolve /ticket command ID — mentions will be plain text:', err.message);
        }
    });
}

function mention(subcommand) {
    const path = `ticket ${subcommand}`;
    return ticketCommandId ? `</${path}:${ticketCommandId}>` : `\`/${path}\``;
}

module.exports = { init, mention };
