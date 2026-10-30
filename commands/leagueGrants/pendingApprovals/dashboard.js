const { renderMainView, loadDashboardState } = require('../../../interactions/questDashboardRender');
const { attachDashboardExpiry } = require('../../../utils/dashboardExpiry');
const { DM_ROLE_ID } = require('../shared');

async function handleDashboard(interaction) {
    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply();

    const questId = interaction.options.getString('quest_id');

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
    } catch (err) {
        if (err.message?.startsWith('❌')) {
            return interaction.editReply({ content: err.message });
        }
        console.error('[leaguedm dashboard] Error loading dashboard state:', err);
        return interaction.editReply({ content: '❌ Could not load the dashboard. Please try again.' });
    }

    const payload = renderMainView(state.draft, state.roster, { grouping: 'character', quest: state.quest });
    const message = await interaction.editReply(payload);
    attachDashboardExpiry(message, state.questId);
    return message;
}

module.exports = {
    handleDashboard,
};
