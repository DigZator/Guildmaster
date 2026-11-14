// The slash command definitions of the character commands: create, profile, edit, setart and the character group. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//create
const create = sub => sub
			.setName('create')
			.setDescription('Register your character in the Adventurer\'s Guild League');

//profile
const profile = sub => sub
			.setName('profile')
			.setDescription('View your character profile')
			.addUserOption(opt => opt
				.setName('user')
				.setDescription('View another player\'s character profile')
				.setRequired(false));

//edit
const edit = sub => sub
			.setName('edit')
			.setDescription('Edit your character details')
			.addStringOption(opt => opt
				.setName('name')
				.setDescription('Update your character\'s name')
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('class')
				.setDescription('Update your character\'s class (e.g. Bladesinger Wizard)')
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('species')
				.setDescription('Update your character\'s species')
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('background')
				.setDescription('Update your character\'s background')
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('charsheet')
				.setDescription('Update your character sheet link')
				.setRequired(false));

//setart
const setart = sub => sub
			.setName('setart')
			.setDescription('Set your character profile art')
			.addAttachmentOption(opt => opt
				.setName('image')
				.setDescription('Your character art (no AI-generated images)')
				.setRequired(true));

//character
const characterGroup = group => group
		    .setName('character')
		    .setDescription('Manage your characters')
		    .addSubcommand(sub => sub
		        .setName('status')
		        .setDescription('Change one of your characters\' status')
		        .addStringOption(opt => opt
		            .setName('character')
		            .setDescription('Which of your characters')
		            .setRequired(true)
		            .setAutocomplete(true))
		        .addStringOption(opt => opt
		            .setName('new_status')
		            .setDescription('New status')
		            .setRequired(true)
		            .addChoices(
		                { name: 'Active',  value: 'Active' },
		                { name: 'Passive', value: 'Passive' },
		                { name: 'Retired', value: 'Retired' },
		            )));

module.exports = { create, profile, edit, setart, characterGroup };
