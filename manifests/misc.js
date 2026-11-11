const game_info = require('../features/games/gameInfo');
const { gameAutocomplete } = require('../utils/gameAutoComplete');

module.exports = {
    name: 'misc',
    commands: [
        { name: 'game_info', policy: 'open', handler: game_info, autocomplete: [{ name: 'games', policy: 'open', handle: gameAutocomplete }] },
    ],
};
