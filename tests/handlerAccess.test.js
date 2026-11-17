// The three access checks that live inside handlers (not in the router), each asked as seven different people.
// Before plan step C5 they called utils/isAdminChannel.js; now they call auth.can. The answers below were recorded from the
// old code and are still what the new code gives, so this proves the swap changed nobody's access.
// (The route-permission snapshot cannot reach the /config and direct line buttons; this does.)
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { root } = require('./helpers/repo');

const EXPECTED = {
    "ticketStaff": {
        "nobody": false,
        "admins-role": true,
        "hr-role": false,
        "cmd-role": false,
        "nobody@ctrl-channel": false,
        "admins-role@ctrl-channel": true,
        "discord-administrator": false
    },
    "configConfirmButton": {
        "nobody": [
            "❌ You do not have permission to use this"
        ],
        "admins-role": [
            "Cancelled. Nothing was changed."
        ],
        "hr-role": [
            "❌ You do not have permission to use this"
        ],
        "cmd-role": [
            "❌ You do not have permission to use this"
        ],
        "nobody@ctrl-channel": [
            "❌ You do not have permission to use this"
        ],
        "admins-role@ctrl-channel": [
            "Cancelled. Nothing was changed."
        ],
        "discord-administrator": [
            "❌ You do not have permission to use this"
        ]
    },
    "directLineButton": {
        "nobody": [
            "❌ Only HR can do that."
        ],
        "admins-role": [
            "❌ Only HR can do that."
        ],
        "hr-role": [
            "❌ This control isn't wired up yet."
        ],
        "cmd-role": [
            "❌ Only HR can do that."
        ],
        "nobody@ctrl-channel": [
            "❌ Only HR can do that."
        ],
        "admins-role@ctrl-channel": [
            "❌ Only HR can do that."
        ],
        "discord-administrator": [
            "❌ Only HR can do that."
        ]
    }
};

function answers() {
    const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers/handlerAccessCli.js')], { cwd: root, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
    const match = (child.stdout || '').match(/ACCESS_JSON_START([\s\S]*?)ACCESS_JSON_END/);
    if (!match) throw new Error('Could not record the handler access answers:\n' + (child.stderr || '').slice(0, 800));
    return JSON.parse(match[1]);
}

test('handler-level access checks answer exactly as they did before they moved to shared/auth', () => {
    assert.deepEqual(answers(), EXPECTED);
});
