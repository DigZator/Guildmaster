// The one public file of the games feature (plan section 3, rule 1). The feature is moved in steps (plan section 8.1,
// A3a to A3e); so far it holds /list_games, /game_info and /get_players.
// definitions is plain data and light to load: deploy-commands.js loads it and must not start anything. It is exported by
// command name because the commands are not registered side by side.
// The games feature contributes no /help families yet (the help text of these commands sits in families that also hold
// other commands), so this file does not load helpData.
module.exports = {
    definitions: require('./definitions').definitions,
};
