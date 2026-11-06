const { routes } = require('../../core/manifest');
const rss = require('./rss/command');
const anon_msg = require('./anon/command');
const anonMessages = require('./anon/buttons');
const { getKeys } = require('./anon/store');

async function anonKeyAutocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = getKeys()
        .filter(k => k.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(k => ({ name: k, value: k }));
    await interaction.respond(choices);
}

// Enforced by the router: the admin role AND the control channel. Each command keeps the refusal it used to give.
const adminCtrl = (name, denied, handler, autocomplete) => ({ name, policy: 'admin_ctrl', denied, handler, autocomplete });
const ADMIN_CHANNEL_ONLY = '❌ This command can only be used by admins in the admin channel.';

module.exports = {
    name: 'messaging',
    commands: [
        adminCtrl('rss', ADMIN_CHANNEL_ONLY, rss),
        adminCtrl('anon_msg', ADMIN_CHANNEL_ONLY, anon_msg, [{ name: 'keys', policy: 'open', handle: anonKeyAutocomplete }]),
    ],
    buttons: {
        exact: routes('open', anonMessages.exact),
        prefix: routes('open', anonMessages.prefix),
    },
};
