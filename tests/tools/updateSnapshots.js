// Regenerates the committed baselines. Run via `npm run snapshots:update`, then review the git diff.
require('../helpers/env');
const fs = require('fs');
const path = require('path');
const { buildCommandSnapshot, buildInventory, buildRoutePermissions } = require('../helpers/snapshots');

(async () => {
    const dir = path.join(__dirname, '..', 'snapshots');
    fs.mkdirSync(dir, { recursive: true });
    const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + '\n');
    write('commands.json', buildCommandSnapshot());
    write('inventory.json', await buildInventory());
    write('routePermissions.json', buildRoutePermissions());
    console.log('Snapshots written to tests/snapshots/. Review `git diff tests/snapshots` before committing.');
    process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
