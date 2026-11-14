// The slash command definitions of /league starter-items. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.
const { buildClassChoices } = require('../starterItems/command');

//starter-items
const starterItems = sub => sub
 			.setName('starter-items')
 			.setDescription('Get your starting equipment from class and background')
 			.addStringOption(opt => opt
 				.setName('class')
 				.setDescription('Your character\'s class')
 				.setRequired(true)
 				.addChoices(...buildClassChoices()))
 			.addStringOption(opt => opt
 				.setName('background')
 				.setDescription('Your character\'s background')
 				.setRequired(true)
 				.setAutocomplete(true));

module.exports = { starterItems };
