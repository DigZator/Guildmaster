// Runs every tests/*.test.js with the built-in node:test runner (works on any Node >= 18).
//
// The run is killed if it takes longer than TEST_TIMEOUT_MS (default 15 minutes): the limit only exists to catch a test
// that hangs, so it is generous for a slow machine such as a Raspberry Pi. A kill is reported as a timeout (exit code 2),
// never as a failing test. TEST_CONCURRENCY limits how many test files run at the same time (a small machine can run
// out of memory with the default):
//   TEST_TIMEOUT_MS=1800000 TEST_CONCURRENCY=1 npm test
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(__dirname, f));
const timeoutMs = Number(process.env.TEST_TIMEOUT_MS) > 0 ? Number(process.env.TEST_TIMEOUT_MS) : 900000;
const args = ['--test'];
if (Number(process.env.TEST_CONCURRENCY) > 0) args.push(`--test-concurrency=${Number(process.env.TEST_CONCURRENCY)}`);

const started = Date.now();
const result = spawnSync(process.execPath, [...args, ...files], { stdio: 'inherit', timeout: timeoutMs, killSignal: 'SIGKILL' });
const seconds = Math.round((Date.now() - started) / 1000);

if (result.error && result.error.code === 'ETIMEDOUT') {
    console.error(`\ntests: did not finish within ${timeoutMs / 1000} s and were stopped. That is a timeout, not a failing test. ` +
        'Run them again, or allow more time and fewer parallel files: TEST_TIMEOUT_MS=1800000 TEST_CONCURRENCY=1 npm test');
    process.exit(2);
}
console.log(`tests: ${files.length} files finished in ${seconds} s`);
process.exit(result.status === null ? 1 : result.status);
