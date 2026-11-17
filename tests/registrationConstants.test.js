// The three registration texts are written into Notion (the "Registration Line" and "Registration Link" of games) and compared
// against what is already there, so changing a character would rewrite or miss existing games. They moved from
// data/registrationDefaults.js to features/games/registrationConstants.js (plan step D5) without changing.
require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const constants = require('../features/games/registrationConstants');

test('the default registration texts are exactly what they were', () => {
    assert.deepEqual(constants, {
        DEFAULT_REGISTRATION_LINE: '**!! Registrations for this game will go live at 9PM IST !!**',
        DEFAULT_REGISTRATION_LINK: 'https://adventuringguildmumbai.fillout.com/player-sign-up',
        LINKED_REGISTRATION_LINE: '**!! Registrations for this game are LIVE at the following link !!**',
    });
});
