const { routes } = require('../core/manifest');
const rss = require('../features/messaging/rss/command');
const anon_msg = require('../features/messaging/anon/command');
const schedule_activation = require('../commands/schedule_activation');
const anonMessages = require('../features/messaging/anon/buttons');
const { getKeys } = require('../features/messaging/anon/store');
const { getCachedGames } = require('../utils/cache');
const { getQueue } = require('../utils/activationQueue');

async function anonKeyAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = getKeys()
        .filter(k => k.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(k => ({ name: k, value: k }));
    await interaction.respond(choices);
}

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

// Enforced by the router: the admin role AND the control channel. Each command keeps the refusal it used to give.
const adminCtrl = (name, denied, handler, autocomplete) => ({ name, policy: 'admin_ctrl', denied, handler, autocomplete });
const ADMIN_CHANNEL_ONLY = '❌ This command can only be used by admins in the admin channel.';
const MOD_CHANNEL_ONLY = '❌ This command can only be used by admins in the mod channel.';

module.exports = {
    name: 'feeds',
    commands: [
        adminCtrl('rss', ADMIN_CHANNEL_ONLY, rss),
        adminCtrl('anon_msg', ADMIN_CHANNEL_ONLY, anon_msg, [{ name: 'keys', policy: 'open', handle: anonKeyAutocomplete }]),
        adminCtrl('schedule_activation', MOD_CHANNEL_ONLY, schedule_activation, [{ name: 'add / remove', policy: 'open', handle: scheduleActivationAutocomplete }]),
    ],
    buttons: {
        exact: routes('open', anonMessages.exact),
        prefix: routes('open', anonMessages.prefix),
    },
};
