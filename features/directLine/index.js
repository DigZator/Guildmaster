// The one public file of the direct-line feature (plan section 3, rule 1). Other code imports only this.
// The definitions are plain data and light to load, because deploy-commands.js loads them and must not start anything.
module.exports = {
    definitions: require('./definitions').definitions,
    // The routes of /direct_line and the dl: buttons. Loaded on first use, because it loads the handlers and the
    // export above must stay light.
    get manifest() { return require('./manifest'); },
};
