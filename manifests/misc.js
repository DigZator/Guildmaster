const game_info = require('../commands/game_info');
const { gameAutocomplete } = require('../utils/gameAutoComplete');

module.exports = {
    name: 'misc',
    commands: [
        { name: 'game_info', policy: 'open', handler: game_info, autocomplete: [{ name: 'games', policy: 'open', handle: gameAutocomplete }] },
    ],
};
