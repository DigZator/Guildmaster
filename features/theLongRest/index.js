// The one public file of the Long Rest (memorials) feature (plan section 3, rule 1). Other code imports only this.
// definitions are plain data and light to load: deploy-commands.js loads them and must not start anything.
module.exports = {
    definitions: require('./definitions').definitions,
    // The routes (policy, handler, gates) of /the_long_rest, the memorial buttons, forms and select. Loaded on first use,
    // because it loads the handlers and the export above must stay light.
    get manifest() { return require('./manifest'); },
};
