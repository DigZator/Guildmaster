const { route, routes } = require('../core/manifest');
const create_campaign = require('../commands/create_campaign');
const manipulate_table = require('../commands/manipulate_table');
const tableAdmin = require('../buttons/tableAdmin');
const createCampaign = require('../buttons/createCampaign');
const { gameAutocomplete } = require('../utils/gameAutoComplete');

// Autocomplete is not permission-checked today (see POST_REFACTOR.md, issue 1), so every entry is 'open'.
const gamePicker = [{ name: 'games', policy: 'open', handle: gameAutocomplete }];

// Enforced by the router; the refusal is the router's default text, which is what each handler used to say.
const admin = (name, handler, autocomplete) => ({ name, policy: 'admin', handler, ...(autocomplete && { autocomplete }) });

module.exports = {
    name: 'games',
    commands: [
        admin('create_campaign', create_campaign),
        admin('manipulate_table', manipulate_table, gamePicker),
    ],
    buttons: {
        // The admin-flow buttons below (table admin, create campaign) are Admins-only, enforced by the
        // router (plan item 15).
        exact: {
            ...routes('admin', createCampaign.exact),   // the create-campaign Confirm and Cancel buttons
        },
        prefix: {
            ...routes('admin', tableAdmin.prefix),   // the table-admin dashboard and the Reopen/Leave closed prompt
        },
    },
    modals: {
        prefix: {
            'tableAdminAddPlayerModal:': route('admin', (i) => require('../modals/tableAdminAddPlayerModal')(i)),
            'tableAdminNumberModal:': route('admin', (i) => require('../modals/tableAdminNumberModal')(i)),
        },
    },
    selects: {
        prefix: { 'tableAdminSeatSelect:': route('admin', (i) => require('../selects/tableAdminSeatSelect').handle(i)) },
    },
};
