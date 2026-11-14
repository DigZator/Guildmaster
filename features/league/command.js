const { getActiveCharacter } = require('./notion');
const { sendInventory } = require('./inventory/button');
const { sendItemDetail } = require('./inventory/helper');
const { leagueShop, leagueMarketplace } = require('./shop');
const { listQuests } = require('./quests/command');
const { leagueDowntime } = require('./downtime/command');
const { leagueStarterItems } = require('./starterItems/command');
const { leagueVoid } = require('./void');
const { handleCreate, showProfile, setCharacterArt, editCharacter } = require('./character/profile');
const { transferGold, showBalance } = require('./gold');
const { showLeaderboard } = require('./leaderboard/command');
const { showQuestLog } = require('./quests/log');
const { changeCharacterStatus } = require('./character/status');

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
			const { buildDashboardEmbed, buildDashboardRows } = require('./dashboard/dashboard');
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
