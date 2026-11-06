// The one public file of the channel-file feature (plan section 3, rule 1). Other code imports only this.
// definitions and help are plain data and light to load: deploy-commands.js and the /help data load them and must not
// start anything.
module.exports = {
    definitions: require('./definitions').definitions,
    help: require('./help'),
};
