// Every feature manifest, in one list. The order is the order core/boot.js starts the features in (each manifest's init),
// so adding or moving a line here changes startup order; tests/startupWiring.test.js pins it.
module.exports = [
    require('./general').manifest,
    require('./games').manifest,
    require('./archive').manifest,
    require('./messaging').manifest,
    require('./theLongRest').manifest,
    require('./tickets').manifest,
    require('./directLine').manifest,
    require('./channelFile').manifest,
    require('./verification').manifest,
    require('./config').manifest,
    require('./league').manifest,
];
