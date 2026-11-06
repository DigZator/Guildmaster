// The one public file of the channel-file feature (plan section 3, rule 1). Other code imports only this.
// definitions and help are plain data and light to load: deploy-commands.js and the /help data load them and must not
// start anything.
module.exports = {
    definitions: require('./definitions').definitions,
    help: require('./help'),
    // The routes (policy, handler, refusal text) of /channel_file, its review buttons and the Proceed form. Loaded on
    // first use, because it loads the handlers and the exports above must stay light.
    get manifest() { return require('./manifest'); },
};
