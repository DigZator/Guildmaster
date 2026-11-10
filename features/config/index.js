// The one public file of the config feature (plan section 3, rule 1): /config.
// definitions and help are plain data and light to load: deploy-commands.js and helpData.js load them and must not
// start anything. The channel-map store and the startup pieces (utils/channelMap.js, utils/mappingCheck.js,
// config/mappings.js, config/roleVars.js) are shared and stay where they are until they move to core/.
module.exports = {
    definitions: require('./definitions').definitions,
    help: require('./help'),
};
