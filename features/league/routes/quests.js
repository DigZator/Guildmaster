// The /league routes of the quests: its buttons, modals, selects and autocomplete. ../manifest.js puts them together in the order
// the old single manifest listed them (the order of the keys decides which prefix route wins).
const { route, routes } = require('../../../core/manifest');
const { questLinkAutocomplete, dashboardQuestAutocomplete } = require('../quests/command');
const questDashboard = require('../quests/dashboard');

// Quest link autocomplete, then the dashboard's quest_id (active quests only). Returns true when it answered.
async function autocomplete(interaction, group, sub) {
    // Quest link autocomplete
    if (interaction.commandName === 'leaguedm' && group === 'quest' && sub === 'link') {
        await questLinkAutocomplete(interaction);
        return true;
    }

    // Dashboard quest_id autocomplete: active quests only
    if (interaction.commandName === 'leaguedm' && sub === 'dashboard') {
        await dashboardQuestAutocomplete(interaction);
        return true;
    }
    return false;
}

module.exports = {
    buttons: { prefix: { ...routes('open', questDashboard.prefix) } },
    modals: {
        prefix: { 'questDash:': route('open', (i) => require('../quests/dashboard').handleDashboardModal(i)) },
    },
    selects: {
        prefix: { 'questDash:': route('open', (i) => require('../quests/dashboard').handleDashboardSelect(i)) },
    },
    userSelects: {
        prefix: { 'questDash:': route('open', (i) => require('../quests/dashboard').handleDashboardUserSelect(i)) },
    },
    autocomplete,
};
