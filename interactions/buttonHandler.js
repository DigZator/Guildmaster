const memorial     	= require('../buttons/memorial');
const announcement 	= require('../buttons/announcement');
const listGames     = require('../buttons/listGames');
const deletions     = require('../buttons/confirmDelete');
const anonMessages  = require('../buttons/anonMessages');
const inventory     = require('../buttons/inventory');
const questComplete = require('../buttons/questComplete');
const shopSearch 	= require('../buttons/shopSearch');
const shopBrowse = require('../buttons/shopBrowse');

const exactHandlers = {
    ...memorial.exact,
    ...announcement.exact,
    ...anonMessages.exact,
};

const prefixHandlers = {
    ...listGames.prefix,
    ...deletions.prefix,
    ...anonMessages.prefix,
    ...inventory.prefix,
    ...questComplete.prefix,
    ...shopSearch.prefix,
    ...shopBrowse.prefix,
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
        	if (error.code === 10062) {
        		console.warn(`[buttonHandler] Interaction expired before we could respond: ${interaction.customId}`);
        		return;
        	}
        	try {
                if (interaction.replied || interaction.deferred) {
                	await interaction.followUp({ content: 'Something went wrong.', flags:64 });
                } else {
                	await interaction.reply({ content: 'Something went wrong.', flags:64 });
                }
            } catch (replyError) {
                console.warn('[buttonHandler] Fallback reply also failed:', replyError.message);
            }
        }
    });
};
