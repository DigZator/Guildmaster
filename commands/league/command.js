const { getActiveCharacter } = require('../../features/league/notion');
const { sendInventory } = require('../../features/league/inventory/button');
const { sendItemDetail } = require('../../features/league/inventory/helper');
const { leagueShop, leagueMarketplace } = require('../../features/league/shop');
const { listQuests } = require('../../features/league/quests/command');
const { leagueDowntime } = require('../../features/league/downtime/command');
const { leagueStarterItems } = require('../../features/league/starterItems/command');
const { leagueVoid } = require('../../features/league/void');
const { handleCreate, showProfile, setCharacterArt, editCharacter } = require('../../features/league/character/profile');
const { transferGold, showBalance } = require('../../features/league/gold');
const { showLeaderboard } = require('../../features/league/leaderboard/command');
const { showQuestLog } = require('../../features/league/quests/log');
const { changeCharacterStatus } = require('../../features/league/character/status');

async function league(interaction, client) {
	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand();

	if (group === 'shop') 			return leagueShop(interaction);
	if (group === 'marketplace') 	return leagueMarketplace(interaction);
	if (group === 'downtime') 		return leagueDowntime(interaction);
	if (group === 'quest') 			return handleQuestGroup(interaction);
	if (group === 'void') 			return leagueVoid(interaction);
	if (group === 'character') 	return handleCharacterGroup(interaction);
	
	switch (sub) {
		case 'create':
			return handleCreate(interaction);

		case 'profile':
			return showProfile(interaction);

		case 'edit':
			return editCharacter(interaction);

		case 'setart':
			return setCharacterArt(interaction, client);

		case 'inv':
			return sendInventory(interaction);

		case 'item':
			return sendItemDetail(interaction);

		case 'gold':
			return transferGold(interaction);

		case 'balance':
			return showBalance(interaction);

		case 'starter-items':
            return leagueStarterItems(interaction);

		case 'log':
			return showQuestLog(interaction);

		case 'leaderboard':
			return showLeaderboard(interaction, client);

		case 'dashboard': {
			await interaction.deferReply({ flags: 64 });
			const { buildDashboardEmbed, buildDashboardRows } = require('../../features/league/dashboard/dashboard');
			const character = await getActiveCharacter(interaction.user.id).catch(() => null);
			return interaction.editReply({ embeds: [buildDashboardEmbed(character)], components: buildDashboardRows(!!character) });
		}

		default:
			return interaction.reply({
				content: 'Unknown subcommand.',
				flags: 64,
			});
	}
}

async function handleQuestGroup(interaction) {
	const sub = interaction.options.getSubcommand();
	if (sub === 'list') return listQuests(interaction);
}

// ─── /league character status ────────────────────────────────────────────────
async function handleCharacterGroup(interaction) {
	const sub = interaction.options.getSubcommand();
	if (sub === 'status') return changeCharacterStatus(interaction);

	return interaction.reply({ content: 'Unknown subcommand.', flags: 64 });
}

module.exports = {
    league,
};
