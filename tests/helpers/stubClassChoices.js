// The /league starter-items class choices come from ~/5etools-src on disk, which the tests do not have, and the league
// command definitions read them as soon as they load. This replaces them with a fixed placeholder. Preload it before
// anything that loads the definitions (deploy-commands.js, the load-everything check).
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    const loaded = originalLoad.apply(this, arguments);
    if (/starterItems\/command$/.test(request) && loaded && !loaded.__stubbed) {
        loaded.buildClassChoices = () => [{ name: 'class choices (from 5etools-src, not snapshotted)', value: 'stub' }];
        loaded.__stubbed = true;
    }
    return loaded;
};
