// The channel-filing review message, its Proceed modal and its button ids, for four sample jobs. The expected output
// (tests/snapshots/channelFileReview.json) was recorded from review.js BEFORE its message builders moved to
// reviewMessages.js (plan step C6) and is edited by hand only when the wording is meant to change.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { root } = require('./helpers/repo');

test('the channel-filing review messages are exactly what they were before the split', () => {
    const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers/channelFileReviewCli.js')], { cwd: root, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
    const match = (child.stdout || '').match(/REVIEW_JSON_START([\s\S]*?)REVIEW_JSON_END/);
    if (!match) throw new Error('Could not build the review messages:\n' + (child.stderr || '').slice(0, 800));
    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'snapshots/channelFileReview.json'), 'utf8'));
    assert.deepEqual(JSON.parse(match[1]), expected);
});
