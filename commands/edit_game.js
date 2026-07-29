const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { getCachedGames } = require('../utils/cache');
const gameFields = require('../data/gameFields.json');
const { fetchPage, stringifyPropertyValue } = require('../utils/notion');
const editGameSession = require('../utils/editGameSession');

const MAX_MODAL_VALUE_LENGTH = 4000;

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

    let currentValue = '';
    try {
        const page = await fetchPage(gameUID);
        const rawProperty = page.properties?.[fieldConfig.notion_key];
        currentValue = stringifyPropertyValue(fieldConfig.type, rawProperty);
    } catch (error) {
        console.error('[edit_game] Failed to fetch current value:', error);
    }

    editGameSession.set(interaction.user.id, {
        gameId: gameUID,
        gameName: game.title,
        fieldName,
        fieldType: fieldConfig.type,
    });

    const modal = new ModalBuilder()
        .setCustomId(`editgame_modal_${interaction.user.id}`)
        .setTitle(`Edit: ${fieldName}`.slice(0, 45));

    const label = fieldConfig.type === 'date'
        ? `${fieldName} (YYYY-MM-DD HH:mm, IST)`.slice(0, 45)
        : fieldName.slice(0, 45);

    const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(label)
        .setStyle(fieldConfig.type === 'rich_text' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(false);

    if (fieldConfig.type === 'date') {
        input.setPlaceholder('2026-08-15 21:00');
    }

    if (currentValue) {
        input.setValue(currentValue.slice(0, MAX_MODAL_VALUE_LENGTH));
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal);
};
