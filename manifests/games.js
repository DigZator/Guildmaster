const { route, routes } = require('../core/manifest');
const manipulate_table = require('../features/games/tableAdmin/manipulateTable');
const tableAdmin = require('../features/games/tableAdmin/buttons');
const { gameAutocomplete } = require('../utils/gameAutoComplete');

// Autocomplete is not permission-checked today (see POST_REFACTOR.md, issue 1), so every entry is 'open'.
const gamePicker = [{ name: 'games', policy: 'open', handle: gameAutocomplete }];

// Enforced by the router; the refusal is the router's default text, which is what each handler used to say.
const admin = (name, handler, autocomplete) => ({ name, policy: 'admin', handler, ...(autocomplete && { autocomplete }) });

module.exports = {
    name: 'games',
    commands: [
        admin('manipulate_table', manipulate_table, gamePicker),
    ],
    buttons: {
        // The table admin buttons below are Admins-only, enforced by the router (plan item 15).
        prefix: {
            ...routes('admin', tableAdmin.prefix),   // the table-admin dashboard and the Reopen/Leave closed prompt
        },
    },
    modals: {
        prefix: {
            'tableAdminAddPlayerModal:': route('admin', (i) => require('../features/games/tableAdmin/addPlayerModal')(i)),
            'tableAdminNumberModal:': route('admin', (i) => require('../features/games/tableAdmin/numberModal')(i)),
        },
    },
    selects: {
        prefix: { 'tableAdminSeatSelect:': route('admin', (i) => require('../features/games/tableAdmin/seatSelect').handle(i)) },
    },
};
