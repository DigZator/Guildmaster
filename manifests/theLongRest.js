const { route, routes } = require('../core/manifest');
const the_long_rest = require('../commands/the_long_rest');
const memorial = require('../buttons/memorial');
const theLongRest = require('../buttons/theLongRest');

const ownTlr = { gate: 'own: tlr_mod' };

module.exports = {
    name: 'theLongRest',
    commands: [{
        name: 'the_long_rest', policy: 'open', handler: the_long_rest,
        subcommands: {
            setup: { policy: 'open', gate: 'admin' },
            reindex: { policy: 'open', gate: 'admin' },
            remove: { policy: 'open', gate: 'own: author, or tlr_mod for any memorial' },
        },
    }],
    buttons: {
        exact: {
            ...routes('open', memorial.exact),
            ...routes('open', theLongRest.exact),
            // moderation buttons: the handler checks tlr_mod
            memorial_mod_approve: route('open', memorial.exact.memorial_mod_approve, ownTlr),
            memorial_mod_deny: route('open', memorial.exact.memorial_mod_deny, ownTlr),
            tlrRemoveRequest: route('open', theLongRest.exact.tlrRemoveRequest, { gate: 'own: author, or tlr_mod' }),
            tlrRemoveProceed: route('open', theLongRest.exact.tlrRemoveProceed, ownTlr),
        },
    },
    modals: {
        exact: {
            characterSubmission_1: route('open', (i, c) => require('../modals/characterSubmission_1')(i, c)),
            characterSubmission_2: route('open', (i, c) => require('../modals/characterSubmission_2')(i, c)),
            tlrRemoveModal: route('open', (i) => require('../buttons/theLongRest').handleRemoveModalSubmit(i), { gate: 'own: author, or tlr_mod' }),
        },
    },
    selects: {
        exact: { tlrRemoveSelect: route('open', (i) => require('../buttons/theLongRest').handleRemoveSelect(i), { gate: 'own: author, or tlr_mod' }) },
    },
};
