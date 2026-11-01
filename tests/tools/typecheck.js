// Type-aware lint pass (`tsc --checkJs --noEmit`) run as a RATCHET.
//
// The codebase is plain CommonJS JavaScript, so tsc reports many findings that are not bugs (for example
// `module.exports = fn; module.exports.x = ...` cannot be modeled). Rather than demand zero, the current
// findings are recorded in tests/snapshots/typecheck-baseline.json and the check FAILS ON ANY NEW FINDING.
// That catches broken imports, missing exports and wrong calls introduced while code is moved around.
//
//   npm run typecheck          compare against the baseline
//   npm run typecheck:update   accept the current findings (review the git diff first)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const baselinePath = path.join(root, 'tests', 'snapshots', 'typecheck-baseline.json');
const update = process.argv.includes('--update');

const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const run = spawnSync(bin, ['-p', root, '--pretty', 'false', '--noEmit'], { cwd: root, encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 26 });
if (run.error) { console.error('Could not run tsc:', run.error.message); process.exit(2); }

// "file(12,3): error TS2339: message"  ->  key without the position, so edits above a finding do not churn the baseline.
const found = {};
const examples = {};
for (const line of (run.stdout || '').split('\n')) {
    const m = line.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/);
    if (!m) continue;
    const key = `${m[1].split(path.sep).join('/')} | ${m[3]} | ${m[4].trim()}`;
    found[key] = (found[key] || 0) + 1;
    (examples[key] = examples[key] || []).push(`${m[1]}:${m[2]}`);
}
if (!Object.keys(found).length && run.status !== 0 && !(run.stdout || '').trim()) {
    console.error('tsc failed without reporting findings:\n' + (run.stderr || '').slice(0, 800)); process.exit(2);
}

const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
if (update) {
    const body = { note: 'Known tsc --checkJs findings (file | code | message -> count). Fix them to shrink this file; never grow it by hand.', total: Object.values(found).reduce((a, b) => a + b, 0), findings: sorted(found) };
    fs.writeFileSync(baselinePath, JSON.stringify(body, null, 2) + '\n');
    console.log(`Baseline written: ${body.total} findings in ${Object.keys(found).length} groups.`);
    process.exit(0);
}

let baseline = { findings: {} };
try { baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); }
catch { console.error('Missing tests/snapshots/typecheck-baseline.json. Run `npm run typecheck:update` and commit it.'); process.exit(1); }

const fresh = [];
for (const [key, count] of Object.entries(found)) {
    const allowed = baseline.findings[key] || 0;
    if (count > allowed) fresh.push(`${key}  (${count - allowed} new; at ${examples[key].join(', ')})`);
}
const fixed = Object.entries(baseline.findings).reduce((n, [key, count]) => n + Math.max(0, count - (found[key] || 0)), 0);

if (fresh.length) {
    console.error(`typecheck: ${fresh.length} new finding(s):\n  - ${fresh.join('\n  - ')}\nFix them, or if they are known false positives run \`npm run typecheck:update\` and review the diff.`);
    process.exit(1);
}
console.log(`typecheck: no new findings (${Object.values(found).reduce((a, b) => a + b, 0)} known).` + (fixed ? ` ${fixed} baseline finding(s) are fixed: run \`npm run typecheck:update\` to shrink the baseline.` : ''));
