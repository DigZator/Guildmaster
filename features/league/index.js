// The public file of the league feature (plan section 3, rule 1). Other code imports only this.
// help is plain data and light to load: the /help data loads it at boot and it must not start anything.
module.exports = {
    // The /help families of the three league groups, in order.
    help: require('./help'),
    // The /league, /leagueadmin and /leaguedm command definitions. Loaded on first use, because the class choices of
    // /league starter-items are read from 5etools-src on disk when they load, and only deploy-commands.js needs them.
    get definitions() { return require('./definitions').definitions; },
};
