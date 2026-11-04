const { routes } = require('../core/manifest');
const rss = require('../commands/rss');
const anon_msg = require('../commands/anon_msg');
const schedule_activation = require('../commands/schedule_activation');
const anonMessages = require('../buttons/anonMessages');
const { getKeys } = require('../utils/anonStore');
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

const adminCtrl = (name, handler, autocomplete) => ({ name, policy: 'open', gate: 'admin_ctrl', handler, autocomplete });

module.exports = {
    name: 'feeds',
    commands: [
        adminCtrl('rss', rss),
        adminCtrl('anon_msg', anon_msg, [{ name: 'keys', policy: 'open', handle: anonKeyAutocomplete }]),
        adminCtrl('schedule_activation', schedule_activation, [{ name: 'add / remove', policy: 'open', handle: scheduleActivationAutocomplete }]),
    ],
    buttons: {
        exact: routes('open', anonMessages.exact),
        prefix: routes('open', anonMessages.prefix),
    },
};
