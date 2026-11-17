// The one public file of the config feature (plan section 3, rule 1): /config.
// definitions and help are plain data and light to load: deploy-commands.js and helpData.js load them and must not
// start anything. The channel-map store and the startup pieces (core/channelMap.js, core/mappingCheck.js,
// core/mappings.js, core/roleVars.js) are shared by the startup and by this feature, so they live in core/.
module.exports = {
    definitions: require('./definitions').definitions,
    help: require('./help'),
    // The routes of /config, its key autocomplete and the confirm button. Loaded on first use, because it loads the handlers
    // and the exports above must stay light.
    get manifest() { return require('./manifest'); },
};
