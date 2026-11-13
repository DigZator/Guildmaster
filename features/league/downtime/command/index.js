const { handleDowntimeStart } = require('./start');
const { handleDowntimeProgress } = require('./progress');
const { handleDowntimeList } = require('./list');
const { handleDowntimeBuyDays, REP_COST_PER_TOPUP, DAYS_PER_TOPUP } = require('./buyDays');
const { handleDowntimeActivities } = require('./activities');

// ─── Router ───────────────────────────────────────────────────────────────────

async function leagueDowntime(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'start':      return handleDowntimeStart(interaction);
        case 'progress':   return handleDowntimeProgress(interaction);
        case 'list':       return handleDowntimeList(interaction);
        case 'buy-days':   return handleDowntimeBuyDays(interaction);
        case 'activities': return handleDowntimeActivities(interaction);
    }
}

module.exports = { leagueDowntime, handleDowntimeList, REP_COST_PER_TOPUP, DAYS_PER_TOPUP };
