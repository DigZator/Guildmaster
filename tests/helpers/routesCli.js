// Child process: resolves button routes through the real router, prints JSON, exits.
require('./env');
const { describeButtonRoutes } = require('./routes');
describeButtonRoutes()
    .then(routes => { process.stdout.write('ROUTES_JSON_START\n' + JSON.stringify(routes) + '\nROUTES_JSON_END\n'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
