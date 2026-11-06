// The one public file of the messaging feature (plan section 3, rule 1). Other code imports only this.
// It is deliberately light: loading it must not load the command handlers, because deploy-commands.js and the
// /help data load it too and neither should start anything.
module.exports = {
    definitions: require('./definitions').definitions,
    help: require('./help'),
};
