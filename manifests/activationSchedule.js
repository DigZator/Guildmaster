const schedule_activation = require('../commands/schedule_activation');
const { getCachedGames } = require('../utils/cache');
const { getQueue } = require('../utils/activationQueue');

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

// Enforced by the router: the admin role AND the control channel, with this command's own refusal text.
const adminCtrl = (name, denied, handler, autocomplete) => ({ name, policy: 'admin_ctrl', denied, handler, autocomplete });
const MOD_CHANNEL_ONLY = '❌ This command can only be used by admins in the mod channel.';

module.exports = {
    name: 'activation-schedule',
    commands: [
        adminCtrl('schedule_activation', MOD_CHANNEL_ONLY, schedule_activation, [{ name: 'add / remove', policy: 'open', handle: scheduleActivationAutocomplete }]),
    ],
};
