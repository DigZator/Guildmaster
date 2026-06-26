const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function buildLeagueCreateModal() {
  const modal = new ModalBuilder()
    .setCustomId('leagueCreate')
    .setTitle('Register Your Character');

  const characterName = new TextInputBuilder()
    .setCustomId('characterName')
    .setLabel('Character Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const classLevel = new TextInputBuilder()
    .setCustomId('classLevels')
    .setLabel('Class')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. Fighter, Wizard, Cleric, Rogue')
    .setRequired(true)
    .setMaxLength(100);

  const species = new TextInputBuilder()
    .setCustomId('species')
    .setLabel('Species')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const background = new TextInputBuilder()
    .setCustomId('background')
    .setLabel('Background')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder().addComponents(characterName),
    new ActionRowBuilder().addComponents(classLevel),
    new ActionRowBuilder().addComponents(species),
    new ActionRowBuilder().addComponents(background),
  );

  return modal;
}

module.exports = { buildLeagueCreateModal };
