// The one public file of the verification feature (plan section 3, rule 1). Other code imports only this.
// definitions are plain data and light to load: deploy-commands.js loads them and must not start anything.
module.exports = {
    definitions: require('./definitions').definitions,
    // The routes (policy, handler, refusal text) of /verification, its buttons, pager and form. Loaded on first use,
    // because it loads the handlers and the export above must stay light.
    get manifest() { return require('./manifest'); },
};
