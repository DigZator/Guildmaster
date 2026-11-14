const { SlashCommandBuilder } = require('discord.js');
const catalogue = require('./catalogue');
const character = require('./character');
const dashboard = require('./dashboard');
const downtime = require('./downtime');
const gold = require('./gold');
const grants = require('./grants');
const inventory = require('./inventory');
const leaderboard = require('./leaderboard');
const quests = require('./quests');
const shop = require('./shop');
const starterItems = require('./starterItems');
const voidCommand = require('./void');

// The three league commands in the order they are registered. The order of the calls below is the order of the options,
// so it must not change without the commands snapshot changing with it.
const definitions = [
	//league
	new SlashCommandBuilder()
		.setName('league')
		.setDescription("Adventurer's Guild League Commands")
		.addSubcommand(character.create)
		.addSubcommand(character.profile)
		.addSubcommand(character.edit)
		.addSubcommand(character.setart)
		.addSubcommand(inventory.inv)
		.addSubcommand(inventory.item)
		.addSubcommandGroup(character.characterGroup)
		.addSubcommandGroup(shop.shopGroup)
		.addSubcommandGroup(shop.marketplaceGroup)
		.addSubcommand(quests.log)
		.addSubcommand(leaderboard.leaderboard)
		.addSubcommand(dashboard.dashboard)
		.addSubcommand(gold.gold)
		.addSubcommand(gold.balance)
		.addSubcommandGroup(quests.questGroup)
		.addSubcommandGroup(downtime.downtimeGroup)
		.addSubcommand(starterItems.starterItems)
		.addSubcommandGroup(voidCommand.voidGroup),

	//leagueadmin
	new SlashCommandBuilder()
		.setName('leagueadmin')
		.setDescription('League admin commands')
		.addSubcommand(grants.rep)
		.addSubcommand(grants.adminGold)
		.addSubcommand(grants.milestone)
		.addSubcommand(grants.pending)
		.addSubcommand(grants.approve)
		.addSubcommand(grants.reject)
		.addSubcommand(grants.clear)
		.addSubcommandGroup(grants.itemGroup)
		.addSubcommandGroup(shop.adminShopGroup)
		.addSubcommandGroup(catalogue.catalogueGroup)
		.addSubcommandGroup(grants.auditGroup),

	//leaguedm
	new SlashCommandBuilder()
		.setName('leaguedm')
		.setDescription('League DM commands')
		.addSubcommandGroup(quests.dmQuestGroup)
		.addSubcommand(quests.dmDashboard),
];

module.exports = { definitions };
