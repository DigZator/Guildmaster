const { leagueAdminShop, leagueAdminCatalogue } = require('../leagueShop');
const { leagueDowntime } = require('../leagueDowntime');
const { leagueDMQuest } = require('../leagueQuest');
const { REP_MAX } = require('./shared');

const { handleAdminRep, handleAdminGold, handleAdminMilestone, handleDMRep, handleDMGold, handleDMMilestone } = require('./repGoldMilestone');
const { handleDashboard, handlePending, handleApprove, handleClear, handleReject } = require('./pendingApprovals');
const { handleAdminItemCreate, handleAdminItemImport, handleDMItemCreate, handleDMItemImport } = require('./items');
const { handleAdminAuditCharacters } = require('./audit');

// ─── Routers ──────────────────────────────────────────────────────────────────

async function leagueAdmin(interaction, client) {
	const group = interaction.options.getSubcommandGroup();
	const sub = interaction.options.getSubcommand();
	if (group === 'item') {
		if (sub === 'create') return handleAdminItemCreate(interaction);
		if (sub === 'import') return handleAdminItemImport(interaction);
	}
	if (group === 'shop')      return leagueAdminShop(interaction);
	if (group === 'catalogue') return leagueAdminCatalogue(interaction);
	if (group === 'audit') {
		if (sub === 'characters') return handleAdminAuditCharacters(interaction);
	}
	if (sub === 'rep')       return handleAdminRep(interaction);
	if (sub === 'gold')      return handleAdminGold(interaction);
	if (sub === 'milestone') return handleAdminMilestone(interaction, client);
	if (sub === 'pending') return handlePending(interaction);
	if (sub === 'approve') return handleApprove(interaction, client);
	if (sub === 'reject') return handleReject(interaction);
	if (sub === 'clear') return handleClear(interaction);
}

async function leagueDM(interaction, client) {
	const sub = interaction.options.getSubcommand();
	const group = interaction.options.getSubcommandGroup();
	if (group === "item") {
		if (sub === 'create') return handleDMItemCreate(interaction);
		if (sub === 'import') return handleDMItemImport(interaction);
	}
	if (group === "quest") 	 return leagueDMQuest(interaction);
	if (sub === 'rep')       return handleDMRep(interaction);
	if (sub === 'gold')      return handleDMGold(interaction);
	if (sub === 'milestone') return handleDMMilestone(interaction);
	if (sub === 'dashboard') return handleDashboard(interaction);
}

module.exports = { leagueAdmin, leagueDM, leagueDowntime, REP_MAX };
