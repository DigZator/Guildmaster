const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    throw new Error('Missing environment variables');
}

const commands = [
	//ping
	new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!'),

	//the_long_rest
	new SlashCommandBuilder()
		.setName('the_long_rest')
		.setDescription('Manage character memorials')
		.addSubcommand(subcommand => subcommand
			.setName('add')
			.setDescription('Add a character memorial'))
		.addSubcommand(subcommand => subcommand
			.setName('remove')
			.setDescription('Remove a character memorial')
			.addStringOption(opt => opt
				.setName('message_id')
				.setDescription('ID of the message to remove')
				.setRequired(true))),

	//announce_game
	new SlashCommandBuilder()
		.setName('announce_game')
		.setDescription('Announce a game to the quest board')
		.addStringOption(option => option
			.setName('game')
			.setDescription('Select a game to announce')
			.setAutocomplete(true))
		.addBooleanOption(option => option
			.setName('manual')
			.setDescription('Manually input announcement details instead of using game info')),

	//list_games
	new SlashCommandBuilder()
		.setName('list_games')
		.setDescription('Browse upcoming games')
		.addBooleanOption(option => option
			.setName('browsing')
			.setDescription('Show all announced games including full and closed ones'))
		.addIntegerOption(option => option
			.setName('n')
			.setDescription('Limit the number of games shown')
			.setMinValue(1))
		.addStringOption(option => option
			.setName('format_filter')
			.setDescription('Filter games by format')
			.addChoices(
				{ name: 'Online', value: 'Online' },
				{ name: 'In-Person', value: 'In-Person' },
				{ name: 'Play-by-Post', value: 'Play-By-Post' },))
		.addStringOption(option => option
			.setName('type_filter')
			.setDescription('Filter games by type')
			.addChoices(
				{ name: 'One-Shots', value: 'One-Shot' },
				{ name: 'Mini-Adventures', value: 'Mini-Adventure' },
				{ name: 'Campaigns', value: 'Campaign' },
				{ name: 'Workshops', value: 'Workshop' },))
		.addBooleanOption(option => option
			.setName('public')
			.setDescription('Show results publicly in the channel (default: only you can see)')),

	//game_info
	new SlashCommandBuilder()
		.setName('game_info')
		.setDescription('Get detailed info about a game')
		.addStringOption(opt => opt
			.setName('uid')
			.setDescription('Search for game by name')
			.setRequired(true)
			.setAutocomplete(true))
		.addBooleanOption(opt =>opt
			.setName('public')
			.setDescription('Show results public in channel (default: false)')),

	//rss
	new SlashCommandBuilder()
		.setName('rss')
		.setDescription('Manage RSS feeds')
		//add
		.addSubcommand(sub => sub
			.setName('add')
			.setDescription('Add a new RSS feed')
			.addStringOption(opt => opt
				.setName('url')
				.setDescription('The RSS feed URL')
				.setRequired(true))
			.addStringOption(opt => opt
				.setName('name')
				.setDescription('Display name for the feed')
				.setRequired(true))
			.addChannelOption(opt => opt
				.setName('channel')
				.setDescription('Channel to post to (defaults to #feeds)')
				.setRequired(false)))
		//remove
		.addSubcommand(sub => sub
			.setName('remove')
			.setDescription('Remove an RSS feed')
			.addStringOption(opt => opt
				.setName('query')
				.setDescription('Feed name or URL to remove')
				.setRequired(true)))
		//list
		.addSubcommand(sub => sub
			.setName('list')
			.setDescription('List all RSS feeds')),

	//anon_msg
	new SlashCommandBuilder()
		.setName('anon_msg')
		.setDescription('Manage anonymous messages')
		//add
		.addSubcommand(sub => sub
			.setName('add')
			.setDescription('Send a new anonymous message')
			.addChannelOption(opt => opt
				.setName('channel')
				.setDescription('Channel to post in')
				.setRequired(true))
			.addStringOption(opt => opt
				.setName('key')
				.setDescription('Unique key to identify this message (required for edit)')
				.setRequired(false))
			.addStringOption(opt => opt
				.setName('content')
				.setDescription('Message content (single line)')
				.setRequired(false))
			.addBooleanOption(opt => opt
				.setName('multiline')
				.setDescription('Provide content interactively in triple backticks')
				.setRequired(false)))
		//rmv
		.addSubcommand(sub => sub
			.setName('rmv')
			.setDescription('Remove an anonymous message')
				.addStringOption(opt => opt
					.setName('key')
					.setDescription('Key of the message to remove')
					.setRequired(true)
					.setAutocomplete(true)))
		//edit
		.addSubcommand(sub => sub
			.setName('edit')
			.setDescription('Edit an anonymous message')
		.addStringOption(opt => opt
			.setName('key')
			.setDescription('Key of the message to edit')
			.setRequired(true)
			.setAutocomplete(true))),

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
			.setDescription('Show current schedule settings and queue')),
	//help
	new SlashCommandBuilder()
		.setName('help')
		.setDescription('Show Guildmaster commands, organized by section')
		.addStringOption(opt => opt.setName('group').setDescription('Which command group to see help for').setRequired(true)
			.addChoices(
				{ name: 'Help (about the help command)', value: 'help' },
				{ name: 'Player',        value: 'player' },
				{ name: 'Admin',         value: 'admin' },
				{ name: 'League',        value: 'league' },
				{ name: 'League DM',     value: 'leaguedm' },
				{ name: 'League Admin',  value: 'leagueadmin' },
			)
		)
		.addStringOption(opt => opt.setName('family').setDescription('Which section within that group').setRequired(true).setAutocomplete(true)),

	//edit_game
	new SlashCommandBuilder()
		.setName('edit_game')
		.setDescription('Edit a field on a game in Notion')
		.addStringOption(option => option
			.setName('game')
			.setDescription('Select a game to edit')
			.setRequired(true)
			.setAutocomplete(true))
		.addStringOption(opt => opt
			.setName('field')
			.setDescription('Select a field to edit')
			.setRequired(true)
			.setAutocomplete(true)),

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
			.addIntegerOption(opt => opt
				.setName('id')
				.setDescription('The item number from your inventory list (e.g. 3)')
				.setRequired(true)
				.setMinValue(1))
			.addBooleanOption(opt => opt
				.setName('public')
				.setDescription('Show this to everyone in the channel? (default: private)')
				.setRequired(false)))
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
		        .addStringOption(opt => opt.setName('id').setDescription('Shop item ID').setRequired(true)))
		    .addSubcommand(sub => sub
		        .setName('search')
		        .setDescription('Search the full item catalogue by name')
		        .addStringOption(opt => opt.setName('name').setDescription('Item name to search for').setRequired(true)))
		    .addSubcommand(sub => sub
		        .setName('info')
		        .setDescription('View full details of an item by its code')
		        .addStringOption(opt => opt.setName('code').setDescription('Item code (from search/browse)').setRequired(true))))
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
		        .addStringOption(opt => opt.setName('item_id').setDescription('Item ID from your inventory').setRequired(true))
		        .addIntegerOption(opt => opt.setName('price').setDescription('Asking price in gp').setRequired(true).setMinValue(1)))
		    .addSubcommand(sub => sub
		        .setName('unlist')
		        .setDescription('Remove your marketplace listing')
		        .addStringOption(opt => opt.setName('id').setDescription('Listing ID to remove').setRequired(true))))
		//log
		.addSubcommand(sub =>sub
			.setName('log')
			.setDescription('View your quest log'))
		//gold
		.addSubcommand(sub => sub
			.setName('gold')
			.setDescription('Transfer gold to another player')
			.addUserOption(opt => opt
				.setName('player')
				.setDescription('The player to send gold to')
				.setRequired(true))
			.addIntegerOption(opt => opt
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
		        .addStringOption(opt => opt.setName('activity').setDescription('Activity ID').setRequired(true))
		        .addStringOption(opt => opt.setName('param').setDescription('Activity-specific parameter (e.g. spell level, rarity)').setRequired(false)))
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
		        .setDescription('List all downtime activity IDs you can use with /league downtime start'))),

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
			.addIntegerOption(opt => opt.setName('amount').setDescription('Amount in gp (admin can use negative)').setRequired(true)))
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
			.addStringOption(opt => opt.setName('id').setDescription('Action ID (comma separated - "34, 756")').setRequired(true)))
		.addSubcommandGroup(group => group
			.setName('item')
			.setDescription('Item management')
			.addSubcommand(sub => sub
				.setName('create')
				.setDescription('Create a new inventory item')
				.addStringOption(opt => opt.setName('name').setDescription('Item name').setRequired(true))
				.addStringOption(opt => opt.setName('type').setDescription('Item type').setRequired(true)
					.addChoices(
						{ name: 'Armor',            value: 'Armor' },
						{ name: 'Shield',           value: 'Shield' },
						{ name: 'Weapon',           value: 'Weapon' },
						{ name: 'Melee Weapon',     value: 'Melee Weapon' },
						{ name: 'Ranged Weapon',    value: 'Ranged Weapon' },
						{ name: 'Ammunition',       value: 'Ammunition' },
						{ name: 'Tool',             value: 'Tool' },
						{ name: 'Gaming Set',       value: 'Gaming Set' },
						{ name: 'Instrument',       value: 'Instrument' },
						{ name: 'Adventuring Gear', value: 'Adventuring Gear' },
						{ name: 'Gear',             value: 'Gear' },
						{ name: 'Potion',           value: 'Potion' },
						{ name: 'Scroll',           value: 'Scroll' },
						{ name: 'Rod',              value: 'Rod' },
						{ name: 'Ring',             value: 'Ring' },
						{ name: 'Wand',             value: 'Wand' },
						{ name: 'Staff',            value: 'Staff' },
						{ name: 'Wondrous Item',    value: 'Wondrous Item' },
						{ name: 'Treasure',         value: 'Treasure' },
						{ name: 'Trade Good',       value: 'Trade Good' },
						{ name: 'Vehicle',          value: 'Vehicle' },
					)
				)
				.addStringOption(opt => opt.setName('rarity').setDescription('Rarity').setRequired(true)
					.addChoices(
						{ name: 'Common',    value: 'Common' },
						{ name: 'Uncommon',  value: 'Uncommon' },
						{ name: 'Rare',      value: 'Rare' },
						{ name: 'Very Rare', value: 'Very Rare' },
						{ name: 'Legendary', value: 'Legendary' },
					)
				)
				.addStringOption(opt => opt.setName('subtype').setDescription('Subtype').setRequired(false)
					.addChoices(
						{ name: 'Potion',      value: 'Potion' },
						{ name: 'Spell Scroll',value: 'Spell Scroll' },
						{ name: 'Gear',        value: 'Gear' },
						{ name: 'Ammo',        value: 'Ammo' },
						{ name: 'Other',       value: 'Other' },
					)
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
				.addStringOption(opt => opt.setName('code').setDescription('Catalogue item code (see /league shop search)').setRequired(true))
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
				.addStringOption(opt => opt.setName('code').setDescription('Catalogue item code').setRequired(true))
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
				.addStringOption(opt => opt.setName('code').setDescription('Shop item ID').setRequired(true)))
			.addSubcommand(sub => sub
				.setName('restock')
				.setDescription('Manually trigger a restock for an item')
				.addStringOption(opt => opt.setName('code').setDescription('Shop item ID').setRequired(true))))
		//catalogue
		.addSubcommandGroup(group => group
			.setName('catalogue')
			.setDescription('D&D item catalogue management')
			.addSubcommand(sub => sub
				.setName('sync')
				.setDescription('Refresh the item catalogue from Open5e (2024 SRD)')))
		//downtime
		.addSubcommandGroup(group => group
		    .setName('downtime')
		    .setDescription('Downtime approval management')
		    .addSubcommand(sub => sub
		        .setName('approve')
		        .setDescription('Approve a pending downtime start or completion request')
		        .addStringOption(opt => opt.setName('id').setDescription('Request ID or DTA ID').setRequired(true)))),

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
   		            .setRequired(false)))
  		    .addSubcommand(sub => sub
				.setName('complete')
				.setDescription('Mark a quest as completed (ready for admin approval)')
				.addStringOption(opt => opt
					.setName('quest_id')
					.setDescription('Quest ID')
					.setRequired(true))
				.addIntegerOption(opt => opt
					.setName('milestones')
					.setDescription('Total milestones given out this quest')
					.setRequired(true)
					.setMinValue(0))
				.addIntegerOption(opt => opt
					.setName('reputation')
					.setDescription('Total reputation given out this quest')
					.setRequired(true)
					.setMinValue(0)))
   		    .addSubcommand(sub => sub
   		            .setName('add')
   		            .setDescription('Add players to a quest')
   		            .addStringOption(opt => opt.setName('quest_id').setDescription('Quest ID').setRequired(true))
   		            .addUserOption(opt => opt.setName('user1').setDescription('Player 1').setRequired(true))
   		            .addUserOption(opt => opt.setName('user2').setDescription('Player 2').setRequired(false))
   		            .addUserOption(opt => opt.setName('user3').setDescription('Player 3').setRequired(false))
   		            .addUserOption(opt => opt.setName('user4').setDescription('Player 4').setRequired(false))
   		            .addUserOption(opt => opt.setName('user5').setDescription('Player 5').setRequired(false))
   		            .addUserOption(opt => opt.setName('user6').setDescription('Player 6').setRequired(false)))
   		        .addSubcommand(sub => sub
   		            .setName('remove')
   		            .setDescription('Remove players from a quest')
   		            .addStringOption(opt => opt.setName('quest_id').setDescription('Quest ID').setRequired(true))
   		            .addUserOption(opt => opt.setName('user1').setDescription('Player 1').setRequired(true))
   		            .addUserOption(opt => opt.setName('user2').setDescription('Player 2').setRequired(false))
   		            .addUserOption(opt => opt.setName('user3').setDescription('Player 3').setRequired(false))
   		            .addUserOption(opt => opt.setName('user4').setDescription('Player 4').setRequired(false))
   		            .addUserOption(opt => opt.setName('user5').setDescription('Player 5').setRequired(false))
   		            .addUserOption(opt => opt.setName('user6').setDescription('Player 6').setRequired(false)))
   		        .addSubcommand(sub => sub
   		            .setName('clear')
   		            .setDescription('Remove all players from a quest')
   		            .addStringOption(opt => opt.setName('quest_id').setDescription('Quest ID').setRequired(true))))
	    .addSubcommand(sub => sub
			.setName('rep')
			.setDescription('Request reputation grant for a character')
			.addStringOption(opt => opt.setName('quest_id').setDescription('Quest ID this grant is tied to').setRequired(true))
			.addUserOption(opt => opt.setName('user1').setDescription('Target player 1').setRequired(true))
			.addIntegerOption(opt => opt.setName('amount1').setDescription('Amount (max 2)').setRequired(true))
			.addUserOption(opt => opt.setName('user2').setDescription('Target player 2').setRequired(false))
			.addIntegerOption(opt => opt.setName('amount2').setDescription('Amount (max 2)'))
			.addUserOption(opt => opt.setName('user3').setDescription('Target player 3'))
			.addIntegerOption(opt => opt.setName('amount3').setDescription('Amount (max 2)'))
			.addUserOption(opt => opt.setName('user4').setDescription('Target player 4'))
			.addIntegerOption(opt => opt.setName('amount4').setDescription('Amount (max 2)'))
			.addUserOption(opt => opt.setName('user5').setDescription('Target player 5'))
			.addIntegerOption(opt => opt.setName('amount5').setDescription('Amount (max 2)'))
			.addUserOption(opt => opt.setName('user6').setDescription('Target player 6'))
			.addIntegerOption(opt => opt.setName('amount6').setDescription('Amount (max 2)')))
		.addSubcommand(sub => sub
			.setName('gold')
			.setDescription('Grant gold to a character')
			.addStringOption(opt => opt.setName('quest_id').setDescription('Quest ID this grant is tied to').setRequired(true))
			.addUserOption(opt => opt.setName('user1').setDescription('Target player 1').setRequired(true))
			.addIntegerOption(opt => opt.setName('amount1').setDescription('Amount in gp').setRequired(true))
			.addUserOption(opt => opt.setName('user2').setDescription('Target player 2'))
			.addIntegerOption(opt => opt.setName('amount2').setDescription('Amount in gp'))
			.addUserOption(opt => opt.setName('user3').setDescription('Target player 3'))
			.addIntegerOption(opt => opt.setName('amount3').setDescription('Amount in gp'))
			.addUserOption(opt => opt.setName('user4').setDescription('Target player 4'))
			.addIntegerOption(opt => opt.setName('amount4').setDescription('Amount in gp'))
			.addUserOption(opt => opt.setName('user5').setDescription('Target player 5'))
			.addIntegerOption(opt => opt.setName('amount5').setDescription('Amount in gp'))
			.addUserOption(opt => opt.setName('user6').setDescription('Target player 6'))
			.addIntegerOption(opt => opt.setName('amount6').setDescription('Amount in gp')))
		.addSubcommand(sub => sub
	        .setName('milestone')
	        .setDescription('Grant milestones to a character')
			.addStringOption(opt => opt.setName('quest_id').setDescription('Quest ID this grant is tied to').setRequired(true))
			.addUserOption(opt => opt.setName('user1').setDescription('Target player 1').setRequired(true))
			.addIntegerOption(opt => opt.setName('amount1').setDescription('Number of milestones').setRequired(true))
			.addUserOption(opt => opt.setName('user2').setDescription('Target player 2'))
			.addIntegerOption(opt => opt.setName('amount2').setDescription('Number of milestones'))
			.addUserOption(opt => opt.setName('user3').setDescription('Target player 3'))
			.addIntegerOption(opt => opt.setName('amount3').setDescription('Number of milestones'))
			.addUserOption(opt => opt.setName('user4').setDescription('Target player 4'))
			.addIntegerOption(opt => opt.setName('amount4').setDescription('Number of milestones'))
			.addUserOption(opt => opt.setName('user5').setDescription('Target player 5'))
			.addIntegerOption(opt => opt.setName('amount5').setDescription('Number of milestones'))
			.addUserOption(opt => opt.setName('user6').setDescription('Target player 6'))
			.addIntegerOption(opt => opt.setName('amount6').setDescription('Number of milestones')))
		.addSubcommandGroup(group => group
			.setName('item')
			.setDescription('Item management')
			.addSubcommand(sub => sub
				.setName('create')
				.setDescription('Create and assign an item to a player')
				.addStringOption(opt => opt.setName('quest_id').setDescription('Quest ID this item is tied to').setRequired(true))
				.addStringOption(opt => opt.setName('name').setDescription('Item name').setRequired(true))
				.addStringOption(opt => opt
					.setName('type')
					.setDescription('Item type')
					.setRequired(true)
					.addChoices(
						{ name: 'Armor',            value: 'Armor' },
						{ name: 'Shield',           value: 'Shield' },
						{ name: 'Weapon',           value: 'Weapon' },
						{ name: 'Melee Weapon',     value: 'Melee Weapon' },
						{ name: 'Ranged Weapon',    value: 'Ranged Weapon' },
						{ name: 'Ammunition',       value: 'Ammunition' },
						{ name: 'Tool',             value: 'Tool' },
						{ name: 'Gaming Set',       value: 'Gaming Set' },
						{ name: 'Instrument',       value: 'Instrument' },
						{ name: 'Adventuring Gear', value: 'Adventuring Gear' },
						{ name: 'Gear',             value: 'Gear' },
						{ name: 'Potion',           value: 'Potion' },
						{ name: 'Scroll',           value: 'Scroll' },
						{ name: 'Rod',              value: 'Rod' },
						{ name: 'Ring',             value: 'Ring' },
						{ name: 'Wand',             value: 'Wand' },
						{ name: 'Staff',            value: 'Staff' },
						{ name: 'Wondrous Item',    value: 'Wondrous Item' },
						{ name: 'Treasure',         value: 'Treasure' },
						{ name: 'Trade Good',       value: 'Trade Good' },
						{ name: 'Vehicle',          value: 'Vehicle' },
					)
				)
				.addStringOption(opt => opt
					.setName('rarity')
					.setDescription('Rarity')
					.setRequired(true)
					.addChoices(
						{ name: 'Common',    value: 'Common' },
						{ name: 'Uncommon',  value: 'Uncommon' },
						{ name: 'Rare',      value: 'Rare' },
						{ name: 'Very Rare', value: 'Very Rare' },
						{ name: 'Legendary', value: 'Legendary' },
					)
				)
				.addUserOption(opt => opt
					.setName('player')
					.setDescription('Player to assign the item to')
					.setRequired(true))
				.addStringOption(opt => opt
					.setName('subtype')
					.setDescription('Subtype')
					.setRequired(false)
					.addChoices(
						{ name: 'Potion',       value: 'Potion' },
						{ name: 'Spell Scroll', value: 'Spell Scroll' },
						{ name: 'Gear',         value: 'Gear' },
						{ name: 'Ammo',         value: 'Ammo' },
						{ name: 'Other',        value: 'Other' },
					)
				)
				.addStringOption(opt => opt
					.setName('source')
					.setDescription('How the item was obtained')
					.setRequired(false)
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
				.setDescription('Import an item directly from the 5e catalogue and assign it to a player')
				.addStringOption(opt => opt.setName('quest_id').setDescription('Quest ID this item is tied to').setRequired(true))
				.addStringOption(opt => opt.setName('code').setDescription('Catalogue item code (see /league shop search)').setRequired(true))
				.addUserOption(opt => opt.setName('player').setDescription('Player to assign the item to').setRequired(true))
				.addIntegerOption(opt => opt.setName('value').setDescription('Override the catalogue price (gp)').setRequired(false).setMinValue(0))
				.addStringOption(opt => opt.setName('source').setDescription('How the item was obtained').setRequired(false)
					.addChoices(
						{ name: 'Quest Reward',  value: 'Quest Reward' },
						{ name: 'Shop Purchase', value: 'Shop Purchase' },
						{ name: 'Event',         value: 'Event' },
						{ name: 'Admin Grant',   value: 'Admin Grant' },
					)
				)
				.addStringOption(opt => opt.setName('notes').setDescription('Override the catalogue description').setRequired(false)))),
        
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
