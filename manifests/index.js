// Every feature manifest, in one list. Phase 3 wraps the existing handlers without moving any file;
// in Phase 4 each manifest moves into its feature folder. Nothing requires this file at runtime yet.
module.exports = [
    require('../features/general').manifest,
    require('../features/games').manifest,
    require('./games'),
    require('../features/archive').manifest,
    require('../features/messaging').manifest,
    require('./activationSchedule'),
    require('../features/theLongRest').manifest,
    require('../features/tickets').manifest,
    require('../features/directLine').manifest,
    require('../features/channelFile').manifest,
    require('../features/verification').manifest,
    require('../features/config').manifest,
    require('./league'),
];
