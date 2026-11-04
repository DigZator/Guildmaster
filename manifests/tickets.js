const { route, routes } = require('../core/manifest');
const ticket = require('../commands/ticket');
const ticketButtons = require('../buttons/ticket');

const rules = { gate: 'own: ticket staff / raiser / closer rules (utils/ticketPermissions.js)' };

module.exports = {
    name: 'tickets',
    commands: [{
        name: 'ticket', policy: 'open', handler: ticket,
        subcommands: Object.fromEntries([
            'setup', 'config', 'reset_counter', 'type add', 'type edit', 'type remove', 'type list',
        ].map(key => [key, { policy: 'open', gate: 'admin' }])),
    }],
    buttons: { prefix: routes('open', ticketButtons.prefix, rules) },
    modals: {
        prefix: {
            'ticketCreateModal:': route('open', (i) => require('../buttons/ticket').handleTicketModal(i), { ...rules, falseMeansUnhandled: true }),
            'ticket:': route('open', (i) => require('../buttons/ticket').handleTicketModal(i), { ...rules, falseMeansUnhandled: true }),
        },
    },
};
