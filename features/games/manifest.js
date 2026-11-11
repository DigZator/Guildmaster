const { routes } = require('../../core/manifest');
const gameInfo = require('./gameInfo');
const listGames = require('./listGames');
const getPlayers = require('./getPlayers');
const listGamesButtons = require('./listGamesButtons');
const { gameAutocomplete } = require('../../utils/gameAutoComplete');

// Autocomplete is not permission-checked today (see POST_REFACTOR.md, issue 1), so every entry is 'open'.
const gamePicker = [{ name: 'games', policy: 'open', handle: gameAutocomplete }];

// The games feature is moved in steps (plan section 8.1, A3a to A3e). This manifest holds what has moved so far: the info
// commands. manifests/games.js still holds the rest and is registered after this one.
module.exports = {
    name: 'games',
    commands: [
        { name: 'game_info', policy: 'open', handler: gameInfo, autocomplete: gamePicker },
        // Open to everyone. There is no refusal: the handler (listGamesHelper.js canSeeUnreleased) shows the
        // unreleased games to the Admins role only, a view and not an access check.
        { name: 'list_games', policy: 'open', gate: 'admin', handler: listGames },
        // Enforced by the router; the refusal is the router's default text, which is what the handler used to say.
        { name: 'get_players', policy: 'admin', handler: getPlayers, autocomplete: gamePicker },
    ],
    buttons: {
        // The list_games page buttons check nothing themselves; their messages are ephemeral replies to the command.
        prefix: {
            ...routes('open', listGamesButtons.prefix),
        },
    },
};
