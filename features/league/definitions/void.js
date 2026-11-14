// The slash command definitions of the /league void group. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

const voidGroup = group => group
		    .setName('void')
		    .setDescription('Remove items or gold from your own character')
	        .addSubcommand(sub => sub
	            .setName('item')
	            .setDescription('Void an item from your inventory')
                .addStringOption(opt => opt
                	.setName('id')
                	.setDescription('Pick an item from your inventory')
                	.setRequired(true)
                	.setAutocomplete(true)))
	        .addSubcommand(sub => sub
	        	.setName('gold')
	        	.setDescription('Void gold from your balance')
                .addNumberOption(opt => opt
                	.setName('amount')
                	.setDescription('Amount of gold to void')
                	.setRequired(true)
                	.setMinValue(0.01)));

module.exports = { voidGroup };
