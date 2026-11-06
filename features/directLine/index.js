// The one public file of the direct-line feature (plan section 3, rule 1). Other code imports only this.
// The definitions are plain data and light to load, because deploy-commands.js loads them and must not start anything.
module.exports = {
    definitions: require('./definitions').definitions,
};
