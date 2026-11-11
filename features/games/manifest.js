const { route, routes } = require('../../core/manifest');
const gameInfo = require('./gameInfo');
const listGames = require('./listGames');
const getPlayers = require('./getPlayers');
const createCampaign = require('./createCampaign');
const createCampaignButtons = require('./createCampaign/buttons');
const listGamesButtons = require('./listGamesButtons');
const announceGame = require('./announceGame');
const editGame = require('./editGame');
const editGameAutocomplete = require('./editGameAutocomplete');
const announcementButtons = require('./announcementButtons');
const editGameCheckboxButtons = require('./editGameCheckboxButtons');
const { gameAutocomplete } = require('../../utils/gameAutoComplete');

// Autocomplete is not permission-checked today (see POST_REFACTOR.md, issue 1), so every entry is 'open'.
const gamePicker = [{ name: 'games', policy: 'open', handle: gameAutocomplete }];

// The games feature is moved in steps (plan section 8.1, A3a to A3e). This manifest holds what has moved so far: the info
// announcement and create campaign commands. manifests/games.js still holds the rest and is registered after this one.
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
        },
    },
    modals: {
        prefix: {
            'editgame_modal_': route('open', (i, c) => require('./editGameModal')(i, c)),
            'announceedit_modal_': route('open', (i, c) => require('./announceEditModal')(i, c)),
        },
    },
    selects: {
        exact: { announce_edit_select: route('open', (i, c) => require('./announceEditSelect')(i, c)) },
    },
};
