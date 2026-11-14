// The slash command definitions of the quest commands: /league log and quest, /leaguedm quest and dashboard. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//log
const log = sub =>sub
			.setName('log')
			.setDescription('View a quest log')
			.addUserOption(opt => opt
				.setName('player')
				.setDescription('Whose quest log to view (defaults to you)'))
			.addStringOption(opt => opt
				.setName('character')
				.setDescription('Which character (defaults to their active character)')
				.setAutocomplete(true))
			.addStringOption(opt => opt
				.setName('quest_id')
				.setDescription('View details and allies for a specific quest'));

//quest
const questGroup = group => group
			.setName('quest')
			.setDescription('League quest information')
			.addSubcommand(sub => sub
				.setName('list')
				.setDescription('List all league quests'));

//quest
const dmQuestGroup = group => group
   		    .setName('quest')
   		    .setDescription('League quest management')
   		    .addSubcommand(sub => sub
   		        .setName('link')
   		        .setDescription('Link an announced game to the league quest log')
   		        .addStringOption(opt => opt
   		            .setName('game')
   		            .setDescription('Select a game to link')
   		            .setRequired(true)
   		            .setAutocomplete(true))
   		        .addStringOption(opt => opt
   		            .setName('notes')
   		            .setDescription('Additional notes')
   		            .setRequired(false)));

//dashboard
const dmDashboard = sub => sub
			.setName('dashboard')
			.setDescription('View and manage the live reward draft for a quest')
			.addStringOption(opt => opt
				.setName('quest_id')
				.setDescription('Quest ID')
				.setRequired(true)
				.setAutocomplete(true));

module.exports = { log, questGroup, dmQuestGroup, dmDashboard };
