const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const { buildClassChoices } = require('./commands/leagueStarterItems');
const { ITEM_TYPE_CHOICES, ITEM_SUBTYPE_CHOICES, ITEM_RARITY_CHOICES } = require('./config/itemChoices');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    throw new Error('Missing environment variables');
}

const commands = [
	//ping: defined by the general feature
	require('./features/general').definitions.ping,

	//keep_alive: defined by the general feature
	require('./features/general').definitions.keep_alive,

	//create_campaign: defined by the games feature
	require('./features/games').definitions.create_campaign,

	//the_long_rest: defined by the long-rest feature
	...require('./features/theLongRest').definitions,

	//announce_game: defined by the games feature
	require('./features/games').definitions.announce_game,

	//ticket: defined by the tickets feature
	...require('./features/tickets').definitions,

	//direct_line: defined by the direct-line feature
	...require('./features/directLine').definitions,

	//list_games: defined by the games feature
	require('./features/games').definitions.list_games,

	//get_players: defined by the games feature
	require('./features/games').definitions.get_players,

	//manipulate_table: defined by the games feature
	require('./features/games').definitions.manipulate_table,
	        
	//game_info: defined by the games feature
	require('./features/games').definitions.game_info,

	//rss and anon_msg: defined by the messaging feature
	...require('./features/messaging').definitions,

	//schedule_activation
	new SlashCommandBuilder()
		.setName('schedule_activation')
		.setDescription('Manage the game activation schedule')
		//add
		.addSubcommand(sub => sub
			.setName('add')
			.setDescription('Add a game to the activation queue')
			.addStringOption(opt => opt
				.setName('game')
				.setDescription('Select a game to queue for activation')
				.setRequired(true)
				.setAutocomplete(true)))
		//remove
		.addSubcommand(sub => sub
			.setName('remove')
			.setDescription('Remove a game from the activation queue')
			.addStringOption(opt => opt
				.setName('game')
				.setDescription('Select a game to remove from the queue')
				.setRequired(true)
				.setAutocomplete(true)))
		//view
		.addSubcommand(sub => sub
			.setName('view')
			.setDescription('View the current activation queue'))
		//set-reminder-time
		.addSubcommand(sub => sub
			.setName('set-reminder-time')
			.setDescription('Set the daily reminder time (IST, 24hr)')
			.addStringOption(opt => opt
				.setName('time')
				.setDescription('Time in HH:MM format e.g. 19:00')
				.setRequired(true)))
		//set-activation-time
		.addSubcommand(sub => sub
			.setName('set-activation-time')
			.setDescription('Set the activation time (IST, 24hr)')
			.addStringOption(opt => opt
				.setName('time')
				.setDescription('Time in HH:MM format e.g. 21:00')
				.setRequired(true)))
		//toggle-reminder
		.addSubcommand(sub => sub
			.setName('toggle-reminder')
			.setDescription('Enable or disable the daily reminder'))
		//toggle-auto
		.addSubcommand(sub => sub
			.setName('toggle-auto')
			.setDescription('Enable or disable auto-scheduling games on announcement'))
		//status
		.addSubcommand(sub => sub
			.setName('status')
			.setDescription('Show current schedule settings and queue'))
		//run-now
		.addSubcommand(sub => sub
			.setName('run-now')
			.setDescription('Force the activation job to run now for every queued game')
			.addBooleanOption(opt => opt
				.setName('announce')
				.setDescription('Post the announcement (WhatsApp copy + quest board)? Default: yes')
				.setRequired(false))),
	//help: defined by the general feature
	require('./features/general').definitions.help,

	//edit_game: defined by the games feature
	require('./features/games').definitions.edit_game,

	//league
	new SlashCommandBuilder()
		.setName('league')
		.setDescription("Adventurer's Guild League Commands")
		//create
		.addSubcommand(sub => sub
			.setName('create')
			.setDescription('Register your character in the Adventurer\'s Guild League'))
		//profile
		.addSubcommand(sub => sub
			.setName('profile')
			.setDescription('View your character profile')
			.addUserOption(opt => opt
				.setName('user')
				.setDescription('View another player\'s character profile')
				.setRequired(false)))
		//edit
		.addSubcommand(sub => sub
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
				.setRequired(false)))
		//setart
		.addSubcommand(sub => sub
			.setName('setart')
			.setDescription('Set your character profile art')
			.addAttachmentOption(opt => opt
				.setName('image')
				.setDescription('Your character art (no AI-generated images)')
				.setRequired(true)))
		//inv
		.addSubcommand(sub => sub
			.setName('inv')
			.setDescription('View your inventory'))
		//item
		.addSubcommand(sub => sub
			.setName('item')
			.setDescription('View details of a specific item in your inventory')
			.addStringOption(opt => opt
				.setName('item')
				.setDescription('Find an item by name (autocomplete)')
				.setRequired(false)
				.setAutocomplete(true))
			.addIntegerOption(opt => opt
				.setName('id')
				.setDescription('The item number from your inventory list, e.g. 3 (precise, for double-checking)')
				.setRequired(false)
				.setMinValue(1))
			.addBooleanOption(opt => opt
				.setName('public')
				.setDescription('Show this to everyone in the channel? (default: private)')
				.setRequired(false)))
		//character
		.addSubcommandGroup(group => group
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
		            )))
		)
		//shop
		.addSubcommandGroup(group => group
		    .setName('shop')
		    .setDescription('Guild shop')
		    .addSubcommand(sub => sub
	            .setName('browse')
	            .setDescription('Browse shop with filters')
	            .addStringOption(opt => opt.setName('rarity').setDescription('Filter by rarity').setRequired(false)
	                .addChoices(
	                    { name: 'Common',    value: 'Common' },
	                    { name: 'Uncommon',  value: 'Uncommon' },
	                    { name: 'Rare',      value: 'Rare' },
	                    { name: 'Very Rare', value: 'Very Rare' },
	                    { name: 'Legendary', value: 'Legendary' },
	                ))
	            .addStringOption(opt => opt.setName('sort').setDescription('Sort by').setRequired(false)
	                .addChoices(
	                    { name: 'Price (Low to High)', value: 'price_asc' },
	                    { name: 'Price (High to Low)', value: 'price_desc' },
	                    { name: 'Name', value: 'name' },
	                )))
		    .addSubcommand(sub => sub
		        .setName('buy')
		        .setDescription('Buy an item from the shop')
		        .addStringOption(opt => opt
		        	.setName('id')
		        	.setDescription('Shop item ID')
		        	.setRequired(true)
		        	.setAutocomplete(true)))
	        .addSubcommand(sub => sub
	            .setName('sell')
	            .setDescription('Sell item(s) from your inventory to the shop for half value')
	            .addStringOption(opt => opt
	                .setName('item')
	                .setDescription('Pick a single item from your inventory')
	                .setRequired(false)
	                .setAutocomplete(true))
	            .addStringOption(opt => opt
	                .setName('item_id')
	                .setDescription('[Legacy] Positional #s for multiple items, e.g. 001,003 (may fail if inventory changed)')
	                .setRequired(false)))
		    .addSubcommand(sub => sub
		        .setName('search')
		        .setDescription('Search the full item catalogue by name')
		        .addStringOption(opt => opt
		        	.setName('name')
		        	.setDescription('Item name to search for')
		        	.setRequired(true)))
		    .addSubcommand(sub => sub
		        .setName('info')
		        .setDescription('View full details of an item by its code')
		        .addStringOption(opt => opt
		        	.setName('code')
		        	.setDescription('Item code (from search/browse)')
		        	.setRequired(true)
		        	.setAutocomplete(true))))
		//marketplace
		.addSubcommandGroup(group => group
		    .setName('marketplace')
		    .setDescription('Player marketplace')
		    .addSubcommand(sub => sub
		        .setName('browse')
		        .setDescription('Browse marketplace with filters')
		        .addStringOption(opt => opt.setName('rarity').setDescription('Filter by rarity').setRequired(false)
		            .addChoices(
		                { name: 'Common',    value: 'Common' },
		                { name: 'Uncommon',  value: 'Uncommon' },
		                { name: 'Rare',      value: 'Rare' },
		                { name: 'Very Rare', value: 'Very Rare' },
		                { name: 'Legendary', value: 'Legendary' },
		            ))
		        .addStringOption(opt => opt.setName('sort').setDescription('Sort by').setRequired(false)
		            .addChoices(
		                { name: 'Price',  value: 'Asking Price' },
		                { name: 'Newest', value: 'Listed Date' },
		            )))
		    .addSubcommand(sub => sub
		        .setName('buy')
		        .setDescription('Buy a marketplace listing')
		        .addStringOption(opt => opt.setName('id').setDescription('Listing ID').setRequired(true)))
		    .addSubcommand(sub => sub
		        .setName('list')
		        .setDescription('List an item on the marketplace')
		        .addStringOption(opt => opt.setName('item_id').setDescription('Pick an item from your inventory').setRequired(true).setAutocomplete(true))
		        .addIntegerOption(opt => opt.setName('price').setDescription('Asking price in gp').setRequired(true).setMinValue(1)))
		    .addSubcommand(sub => sub
		        .setName('unlist')
		        .setDescription('Remove your marketplace listing')
		        .addStringOption(opt => opt.setName('id').setDescription('Listing ID to remove').setRequired(true))))
		//log
		.addSubcommand(sub =>sub
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
				.setDescription('View details and allies for a specific quest')))
		//leaderboard
		.addSubcommand(sub => sub
			.setName('leaderboard')
			.setDescription('View the character leaderboard')
			.addStringOption(opt => opt
				.setName('sort_by')
				.setDescription('What to sort by (default: level)')
				.addChoices(
					{ name: 'Level', value: 'level' },
					{ name: 'Gold', value: 'gold' },
					{ name: 'Reputation', value: 'reputation' },
					{ name: 'Milestones', value: 'milestones' },
				))
			.addStringOption(opt => opt
				.setName('order')
				.setDescription('Sort order (default: descending)')
				.addChoices(
					{ name: 'Descending', value: 'descending' },
					{ name: 'Ascending', value: 'ascending' },
				))
			.addStringOption(opt => opt
				.setName('class')
				.setDescription('Filter by class (partial match)'))
			.addStringOption(opt => opt
				.setName('species')
				.setDescription('Filter by species (partial match)'))
			.addStringOption(opt => opt
				.setName('status')
				.setDescription('Filter by status (e.g. Active, Passive, Retired)'))
			.addBooleanOption(opt => opt
				.setName('public')
				.setDescription('Show the result to everyone (default: only you)')))
		//dashboard
		.addSubcommand(sub => sub
			.setName('dashboard')
			.setDescription('Get a personal button dashboard for your character (profile, quests, downtimes, etc.)'))
		//gold
		.addSubcommand(sub => sub
			.setName('gold')
			.setDescription('Transfer gold to another player')
			.addUserOption(opt => opt
				.setName('player')
				.setDescription('The player to send gold to')
				.setRequired(true))
			.addNumberOption(opt => opt
				.setName('amount')
				.setDescription('Amount of gold to transfer')
				.setRequired(true)
				.setMinValue(1)))
		//balance
		.addSubcommand(sub => sub
			.setName('balance')
			.setDescription('Check your gold, reputation, and milestones'))
		//quest
		.addSubcommandGroup(group => group
			.setName('quest')
			.setDescription('League quest information')
			.addSubcommand(sub => sub
				.setName('list')
				.setDescription('List all league quests')))
		//downtime
		.addSubcommandGroup(group => group
		    .setName('downtime')
		    .setDescription('Downtime activities')
		    .addSubcommand(sub => sub
	            .setName('start')
	            .setDescription('Begin a downtime activity')
	            .addStringOption(opt => opt.setName('activity').setDescription('Activity to perform — start typing to search').setRequired(true).setAutocomplete(true))
	            .addStringOption(opt => opt.setName('tier').setDescription('Rarity / spell level / tool / etc. — only needed if the activity above has options').setRequired(false).setAutocomplete(true))
	            .addStringOption(opt => opt.setName('spell').setDescription('Spell to scribe (required for Scribe a Spell Scroll)').setRequired(false).setAutocomplete(true))
	            .addStringOption(opt => opt.setName('item').setDescription('Magic item to craft (required for Craft a Magic Item)').setRequired(false).setAutocomplete(true))
	            .addIntegerOption(opt => opt.setName('quantity').setDescription('How many to craft (crafting activities only, default 1)').setRequired(false).setMinValue(1)))
		    .addSubcommand(sub => sub
		        .setName('progress')
		        .setDescription('Invest days into an active downtime activity')
		        .addStringOption(opt => opt.setName('id').setDescription('DTA ID').setRequired(true))
		        .addIntegerOption(opt => opt.setName('days').setDescription('Days to invest').setRequired(true).setMinValue(1)))
		    .addSubcommand(sub => sub
		        .setName('list')
		        .setDescription('View your active downtime activities'))
		    .addSubcommand(sub => sub
		        .setName('buy-days')
		        .setDescription('Spend 1 reputation point for 10 more downtime days'))
		    .addSubcommand(sub => sub
		        .setName('activities')
		        .setDescription('Browse all downtime activities, their tiers, costs, and approval requirements')))
        //starter-items
 		.addSubcommand(sub => sub
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
 				.setAutocomplete(true)))
		.addSubcommandGroup(group => group
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
                	.setMinValue(0.01)))),

	//leageuadmin
	new SlashCommandBuilder()
		.setName('leagueadmin')
		.setDescription('League admin commands')
		//rep
		.addSubcommand(sub => sub
			.setName('rep')
			.setDescription('Grant reputation to a character')
			.addUserOption(opt => opt.setName('user').setDescription('Target player').setRequired(true))
			.addIntegerOption(opt => opt.setName('amount').setDescription('Amount (max 2)').setRequired(true)))
		//gold
		.addSubcommand(sub => sub
			.setName('gold')
			.setDescription('Grant gold to a character')
			.addUserOption(opt => opt.setName('user').setDescription('Target player').setRequired(true))
			.addNumberOption(opt => opt.setName('amount').setDescription('Amount in gp (admin can use negative)').setRequired(true)))
		//milestone
		.addSubcommand(sub => sub
			.setName('milestone')
			.setDescription('Grant milestones to a character')
			.addUserOption(opt => opt.setName('user').setDescription('Target player').setRequired(true))
			.addIntegerOption(opt => opt.setName('amount').setDescription('Number of milestones').setRequired(true)))
		//pending
		.addSubcommand(sub => sub
			.setName('pending')
			.setDescription('List all pending DM grant actions'))
		//approve
		.addSubcommand(sub => sub
			.setName('approve')
			.setDescription('Approve a pending DM grant action')
			.addStringOption(opt => opt.setName('id').setDescription('Action ID (comma separated - "34, 756")').setRequired(true)))
		//reject
		.addSubcommand(sub => sub
			.setName('reject')
			.setDescription('Reject a pending DM grant action')
			.addStringOption(opt => opt.setName('id').setDescription('Action ID (comma separated - "34, 756")').setRequired(true))
			.addStringOption(opt => opt.setName('reason').setDescription('Reason (required for quest-report rejections)').setRequired(false))
			.addStringOption(opt => opt.setName('line').setDescription('Line ID — reject only one line of a quest-report, leaving the rest pending (single id only)').setRequired(false)))
		//clear
		.addSubcommand(sub => sub
			.setName('clear')
			.setDescription('⚠️ Force-remove a stuck pending action WITHOUT approve/reject logic. Use only if it already applied.')
			.addStringOption(opt => opt.setName('id').setDescription('Action ID (comma separated - "34, 756")').setRequired(true)))
		.addSubcommandGroup(group => group
			.setName('item')
			.setDescription('Item management')
			.addSubcommand(sub => sub
				.setName('create')
				.setDescription('Create a new inventory item')
				.addStringOption(opt => opt.setName('name').setDescription('Item name').setRequired(true))
				.addStringOption(opt => opt.setName('type').setDescription('Item type').setRequired(true)
					.addChoices(...ITEM_TYPE_CHOICES)
				)
				.addStringOption(opt => opt.setName('rarity').setDescription('Rarity').setRequired(true)
					.addChoices(...ITEM_RARITY_CHOICES)
				)
				.addStringOption(opt => opt.setName('subtype').setDescription('Subtype').setRequired(false)
					.addChoices(...ITEM_SUBTYPE_CHOICES)
				)
				.addUserOption(opt => opt.setName('player').setDescription('Assign to a player (optional for admin, required for DM)').setRequired(false))
				.addStringOption(opt => opt.setName('source').setDescription('How the item was obtained').setRequired(false)
					.addChoices(
						{ name: 'Quest Reward',  value: 'Quest Reward' },
						{ name: 'Shop Purchase', value: 'Shop Purchase' },
						{ name: 'Event',         value: 'Event' },
						{ name: 'Admin Grant',   value: 'Admin Grant' },
					)
				)
				.addIntegerOption(opt => opt.setName('value').setDescription('Item value in gp').setRequired(false).setMinValue(0))
				.addStringOption(opt => opt.setName('notes').setDescription('Additional notes').setRequired(false)))
			.addSubcommand(sub => sub
				.setName('import')
				.setDescription('Import an item directly from the 5e catalogue')
				.addStringOption(opt => opt.setName('code').setDescription('Catalogue item code (see /league shop search)').setRequired(true).setAutocomplete(true))
				.addUserOption(opt => opt.setName('player').setDescription('Assign to a player (optional)').setRequired(false))
				.addIntegerOption(opt => opt.setName('value').setDescription('Override the catalogue price (gp)').setRequired(false).setMinValue(0))
				.addStringOption(opt => opt.setName('source').setDescription('How the item was obtained').setRequired(false)
					.addChoices(
						{ name: 'Quest Reward',  value: 'Quest Reward' },
						{ name: 'Shop Purchase', value: 'Shop Purchase' },
						{ name: 'Event',         value: 'Event' },
						{ name: 'Admin Grant',   value: 'Admin Grant' },
					)
				)
				.addStringOption(opt => opt.setName('notes').setDescription('Override the catalogue description').setRequired(false))))
		//shop
		.addSubcommandGroup(group => group
			.setName('shop')
			.setDescription('Guild shop management')
			.addSubcommand(sub => sub
				.setName('stock')
				.setDescription('Add/update an item on the shop floor from the catalogue')
				.addStringOption(opt => opt.setName('code').setDescription('Catalogue item code').setRequired(true).setAutocomplete(true))
				.addIntegerOption(opt => opt.setName('quantity').setDescription('Quantity to stock').setRequired(true).setMinValue(0))
				.addIntegerOption(opt => opt.setName('price').setDescription('Override price in gp (defaults to official SRD price)').setRequired(false).setMinValue(0)))
			.addSubcommand(sub => sub
			    .setName('stockall')
			    .setDescription('Bulk-stock the whole catalogue (or one rarity) at rarity-default quantities')
			    .addStringOption(opt => opt.setName('rarity').setDescription('Limit to one rarity').setRequired(false)
			        .addChoices(
			            { name: 'Common',    value: 'Common' },
			            { name: 'Uncommon',  value: 'Uncommon' },
			            { name: 'Rare',      value: 'Rare' },
			            { name: 'Very Rare', value: 'Very Rare' },
			            { name: 'Legendary', value: 'Legendary' },
			        )))
	        .addSubcommand(sub => sub
				.setName('unstock')
				.setDescription('Remove an item from the shop floor')
				.addStringOption(opt => opt.setName('code').setDescription('Shop item ID').setRequired(true).setAutocomplete(true)))
			.addSubcommand(sub => sub
				.setName('restock')
				.setDescription('Manually trigger a restock for an item')
				.addStringOption(opt => opt.setName('code').setDescription('Shop item ID').setRequired(true).setAutocomplete(true))))
		//catalogue
		.addSubcommandGroup(group => group
			.setName('catalogue')
			.setDescription('D&D item catalogue management')
			.addSubcommand(sub => sub
				.setName('sync')
				.setDescription('Refresh the item catalogue from Open5e (2024 SRD)'))
			.addSubcommand(sub => sub
				.setName('sync-spells')
				.setDescription('Refresh the spell list used by downtime scroll scribing')))
		//audit
		.addSubcommandGroup(group => group
		    .setName('audit')
		    .setDescription('Data-integrity checks')
		    .addSubcommand(sub => sub
		        .setName('characters')
		        .setDescription('Check for players with more than one Active character'))),

	//leaguedm
	new SlashCommandBuilder()
	    .setName('leaguedm')
	    .setDescription('League DM commands')
	    //quest
   		.addSubcommandGroup(group => group
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
   		            .setRequired(false))))
	    //dashboard
	    .addSubcommand(sub => sub
			.setName('dashboard')
			.setDescription('View and manage the live reward draft for a quest')
			.addStringOption(opt => opt
				.setName('quest_id')
				.setDescription('Quest ID')
				.setRequired(true)
				.setAutocomplete(true))),

	//archive and archive-config: defined by the archive feature
	...require('./features/archive').definitions,

	//config: defined by the config feature
	...require('./features/config').definitions,

	//channel_file: defined by the channel-file feature
	...require('./features/channelFile').definitions,

	//verification: defined by the verification feature
	...require('./features/verification').definitions,
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Refreshing application (/) commands...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log('Commands successfully registered.');
    } catch (error) {
        console.error('Failed to register commands:', JSON.stringify(error?.rawError ?? error, null, 2));
    }
})();
