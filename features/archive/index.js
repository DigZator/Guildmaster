// The one public file of the archive feature (plan section 3, rule 1). Other code imports only this.
// definitions and help are plain data and light to load: deploy-commands.js and the /help data load them and must not
// start anything.
module.exports = {
    definitions: require('./definitions').definitions,
    help: require('./help'),
    // The routes (policy, handler) of /archive, /archive-config and the archive buttons. Loaded on first use, because it
    // loads the handlers and the exports above must stay light.
    get manifest() { return require('./manifest'); },
};
