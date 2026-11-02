// Runs every tests/*.test.js with the built-in node:test runner (works on any Node >= 18).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(__dirname, f));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', timeout: 240000, killSignal: 'SIGKILL' });
process.exit(result.status === null ? 1 : result.status);
