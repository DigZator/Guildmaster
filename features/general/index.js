// The one public file of the general feature (plan section 3, rule 1): /ping, /help and /keep_alive.
// definitions is plain data and light to load: deploy-commands.js loads it and must not start anything. It is exported by
// command name because the three commands are not registered side by side.
// The general feature contributes no /help families of its own (the "help" group's about family belongs to helpData.js),
// so this file must never load helpData.
module.exports = {
    definitions: require('./definitions').definitions,
};
