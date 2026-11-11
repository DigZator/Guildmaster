// The one public file of the games feature (plan section 3, rule 1). The feature is moved in steps (plan section 8.1,
// A3a to A3e); so far it holds /list_games, /game_info, /get_players, /announce_game, /edit_game, /create_campaign and
// /manipulate_table.
// definitions and help are plain data and light to load: deploy-commands.js and the /help data load them and must not
// start anything. definitions is exported by command name because the commands are not registered side by side.
// help is the "game-management" family of the admin group. The help of /list_games and /game_info sits in the "general"
// player family, which also holds other commands, so it is not here.
module.exports = {
    definitions: require('./definitions').definitions,
    help: require('./help'),
    // The routes of the commands moved so far. Loaded on first use, because it loads the handlers and the exports above
    // must stay light.
    get manifest() { return require('./manifest'); },
};
