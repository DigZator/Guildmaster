const { route, routes } = require('../../core/manifest');
const gameInfo = require('./gameInfo');
const listGames = require('./listGames');
const getPlayers = require('./getPlayers');
const createCampaign = require('./createCampaign');
const createCampaignButtons = require('./createCampaign/buttons');
const manipulateTable = require('./tableAdmin/manipulateTable');
const tableAdminButtons = require('./tableAdmin/buttons');
const scheduleActivation = require('./activation/scheduleActivation');
const scheduleActivationAutocomplete = require('./activation/autocomplete');
const listGamesButtons = require('./listGamesButtons');
const announceGame = require('./announceGame');
const editGame = require('./editGame');
const editGameAutocomplete = require('./editGameAutocomplete');
const announcementButtons = require('./announcementButtons');
const editGameCheckboxButtons = require('./editGameCheckboxButtons');
const { gameAutocomplete } = require('./gameAutoComplete');

const MOD_CHANNEL_ONLY = '❌ This command can only be used by admins in the mod channel.';

// Autocomplete is not permission-checked today (see POST_REFACTOR.md, issue 1), so every entry is 'open'.
const gamePicker = [{ name: 'games', policy: 'open', handle: gameAutocomplete }];

// The routes of every games command (plan section 8.1, A3a to A3e): the info, announcement, create campaign, table admin
// and activation commands, with their buttons, forms and selects.
module.exports = {
    name: 'games',
    commands: [
        { name: 'game_info', policy: 'open', handler: gameInfo, autocomplete: gamePicker },
        // Open to everyone. There is no refusal: the handler (listGamesHelper.js canSeeUnreleased) shows the
        // unreleased games to the Admins role only, a view and not an access check.
        { name: 'list_games', policy: 'open', gate: 'admin', handler: listGames },
        // Enforced by the router; the refusal is the router's default text, which is what the handler used to say.
        { name: 'get_players', policy: 'admin', handler: getPlayers, autocomplete: gamePicker },
        { name: 'announce_game', policy: 'admin', handler: announceGame, autocomplete: gamePicker },
        { name: 'create_campaign', policy: 'admin', handler: createCampaign },
        { name: 'manipulate_table', policy: 'admin', handler: manipulateTable, autocomplete: gamePicker },
        // Enforced by the router: the admin role AND the control channel, with this command's own refusal text.
        { name: 'schedule_activation', policy: 'admin_ctrl', denied: MOD_CHANNEL_ONLY, handler: scheduleActivation, autocomplete: [{ name: 'add / remove', policy: 'open', handle: scheduleActivationAutocomplete }] },
        { name: 'edit_game', policy: 'admin', handler: editGame, autocomplete: [{ name: 'game / field', policy: 'open', handle: editGameAutocomplete }] },
    ],
    buttons: {
        // These buttons check nothing themselves; their messages are ephemeral replies to admin-gated commands (see
        // POST_REFACTOR.md) or to /list_games.
        exact: {
            ...routes('open', announcementButtons.exact),
            // The create-campaign Confirm and Cancel buttons: Admins-only, enforced by the router (plan item 15).
            ...routes('admin', createCampaignButtons.exact),
        },
        prefix: {
            ...routes('open', listGamesButtons.prefix),
            ...routes('open', editGameCheckboxButtons.prefix),
            // The table admin dashboard and the Reopen/Leave closed prompt: Admins-only, enforced by the router (plan item 15).
            ...routes('admin', tableAdminButtons.prefix),
        },
    },
    modals: {
        prefix: {
            'editgame_modal_': route('open', (i, c) => require('./editGameModal')(i, c)),
            'announceedit_modal_': route('open', (i, c) => require('./announceEditModal')(i, c)),
            'tableAdminAddPlayerModal:': route('admin', (i) => require('./tableAdmin/addPlayerModal')(i)),
            'tableAdminNumberModal:': route('admin', (i) => require('./tableAdmin/numberModal')(i)),
        },
    },
    selects: {
        exact: { announce_edit_select: route('open', (i, c) => require('./announceEditSelect')(i, c)) },
        prefix: { 'tableAdminSeatSelect:': route('admin', (i) => require('./tableAdmin/seatSelect').handle(i)) },
    },
};
