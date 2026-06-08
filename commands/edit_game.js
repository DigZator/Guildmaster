const { isAdminChannel } = require('../utils/isAdminChannel');
const { getCachedGames } = require('../utils/cache');
const gameFields = require('../data/gameFields.json');
const editGameSession = require('../utils/editGameSession');

module.exports = async (interaction) => {
    if (!isAdminChannel(interaction)) {
        await interaction.reply({ content: '❌ This command can only be used in the admin channel.', flags: 64 });
        return;
    }

    const gameUID = interaction.options.getString('game');
    const fieldName = interaction.options.getString('field');

    if (!gameUID || !fieldName) {
        await interaction.reply({ content: '❌ Please provide both a game and a field.', flags: 64 });
        return;
    }

    const fieldConfig = gameFields[fieldName];
    if (!fieldConfig) {
        await interaction.reply({ content: `❌ Unknown field: \`${fieldName}\``, flags: 64 });
        return;
    }

    const games = await getCachedGames();
    const game = games?.find(g => g.uid === gameUID);
    if (!game) {
        await interaction.reply({ content: '❌ Game not found.', flags: 64 });
        return;
    }

    const currentValue = game.properties?.[fieldName] ?? '_No value set_';

    editGameSession.set(interaction.user.id, {
        gameId: gameUID,
        gameName: game.title,
        fieldName,
        fieldType: fieldConfig.type,
    });

    await interaction.reply({
        content: `📋 **${game.title}** — \`${fieldName}\`\n\n**Current value:**\n${currentValue}\n\n✏️ Send the new value in triple backticks e.g.\n\`\`\`\nnew value here\n\`\`\`\nSession expires in 5 minutes.`,
        flags: 64,
    });
};
