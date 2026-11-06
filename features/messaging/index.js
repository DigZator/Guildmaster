// The one public file of the messaging feature (plan section 3, rule 1). Other code imports only this.
// It is deliberately light: loading it must not load the command handlers, because deploy-commands.js and the
// /help data load it too and neither should start anything.
module.exports = {
    definitions: require('./definitions').definitions,
    help: require('./help'),
    // The routes (policy, handler, refusal text) of /rss, /anon_msg and the anon buttons. Loaded on first use, because
    // it loads the handlers and the other two exports above must stay light.
    get manifest() { return require('./manifest'); },
};
