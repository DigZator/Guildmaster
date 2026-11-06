const { route, routes } = require('../../core/manifest');
const ticket = require('./command');
const ticketButtons = require('./buttons');
const { loadTicketTypes } = require('../../config/ticketTypes');

async function ticketAutocomplete(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);
    const focused = interaction.options.getFocused(true);
    const query = focused.value.toLowerCase();
    const types = loadTicketTypes();

    if (sub === 'raise' && focused.name === 'type') {
        const choices = types
            .filter(t => t.key.toLowerCase().includes(query) || t.label.toLowerCase().includes(query))
            .slice(0, 25)
            .map(t => ({ name: `${t.buttonEmoji || '🎫'} ${t.label}`.slice(0, 100), value: t.key }));
        await interaction.respond(choices);
        return;
    }

    if (sub === 'reset_counter' && focused.name === 'type') {
        const choices = types
            .filter(t => t.slug.toLowerCase().includes(query) || t.label.toLowerCase().includes(query))
            .slice(0, 25)
            .map(t => ({ name: `${t.label} (${t.slug})`, value: t.slug }));
        await interaction.respond(choices);
        return;
    }

    if (group === 'type' && (sub === 'edit' || sub === 'remove') && focused.name === 'key') {
        const choices = types
            .filter(t => t.key.toLowerCase().includes(query) || t.label.toLowerCase().includes(query))
            .slice(0, 25)
            .map(t => ({ name: `${t.label} (${t.key})`, value: t.key }));
        await interaction.respond(choices);
    }
}

const rules = { gate: 'own: ticket staff / raiser / closer rules (features/tickets/permissions.js)' };

module.exports = {
    name: 'tickets',
    commands: [{
        name: 'ticket', policy: 'open', handler: ticket,
        autocomplete: [{ name: 'type / key', policy: 'open', handle: ticketAutocomplete }],
        // Admin subcommands are enforced by the router, with the refusal each handler used to give.
        subcommands: Object.fromEntries([
            'setup', 'config', 'reset_counter', 'type add', 'type edit', 'type remove', 'type list',
        ].map(key => [key, { policy: 'admin', denied: '❌ You don\'t have permission to run this.' }])),
    }],
    buttons: { prefix: routes('open', ticketButtons.prefix, rules) },
    modals: {
        prefix: {
            'ticketCreateModal:': route('open', (i) => require('./buttons').handleTicketModal(i), { ...rules, falseMeansUnhandled: true }),
            'ticket:': route('open', (i) => require('./buttons').handleTicketModal(i), { ...rules, falseMeansUnhandled: true }),
        },
    },
};
