const { getCachedGames } = require('../../../utils/cache');
const { getQueue } = require('./activationQueue');

// Autocomplete of /schedule_activation: games not yet activated for `add`, the queued games for `remove`.
async function scheduleActivationAutocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused().toLowerCase();
    const games = await getCachedGames();

    if (sub === 'add') {
        const filtered = games
            .filter(g => !g.activate && g.title.toLowerCase().includes(focused))
            .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
            .slice(0, 25)
            .map(g => ({ name: `${g.title.trim()} (${g.date})`, value: g.uid }));
        await interaction.respond(filtered);
        return;
    }

    if (sub === 'remove') {
        const queue = getQueue().queue;
        const filtered = queue
            .filter(g => g.title.toLowerCase().includes(focused))
            .slice(0, 25)
            .map(g => ({ name: g.title, value: g.uid }));
        await interaction.respond(filtered);
    }
}

module.exports = scheduleActivationAutocomplete;
