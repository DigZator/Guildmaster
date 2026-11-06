// Every feature manifest, in one list. Phase 3 wraps the existing handlers without moving any file;
// in Phase 4 each manifest moves into its feature folder. Nothing requires this file at runtime yet.
module.exports = [
    require('./misc'),
    require('./games'),
    require('../features/messaging').manifest,
    require('./activationSchedule'),
    require('./theLongRest'),
    require('./tickets'),
    require('./directLine'),
    require('./channelFile'),
    require('./verification'),
    require('./config'),
    require('./league'),
];
