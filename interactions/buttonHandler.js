const memorial     = require('../buttons/memorial');
const announcement = require('../buttons/announcement');
const listGames    = require('../buttons/listGames');
const deletions    = require('../buttons/confirmDelete');
const anonMessages = require('../buttons/anonMessages');

const exactHandlers = {
    ...memorial.exact,
    ...announcement.exact,
    ...anonMessages.exact,
};

const prefixHandlers = {
    ...listGames.prefix,
    ...deletions.prefix,
    ...anonMessages.prefix,
};

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        const id = interaction.customId;
        let handler = exactHandlers[id]
            ?? Object.entries(prefixHandlers).find(([prefix]) => id.startsWith(prefix))?.[1];

        if (!handler) {
            console.warn(`Unhandled button: ${id}`);
            return;
        }

        try {
            await handler(interaction, client);
        } catch (error) {
            console.error(`Error handling button "${id}":`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'There was an error processing your request!', flags: 64 });
            }
        }
    });
};