const { route, routes } = require('../../core/manifest');
const the_long_rest = require('./command');
const memorial = require('./memorial');
const theLongRest = require('./buttons');
const deletions = require('./confirmDelete');

const ownTlr = { gate: 'own: tlr_mod' };

module.exports = {
    name: 'theLongRest',
    commands: [{
        name: 'the_long_rest', policy: 'open', handler: the_long_rest,
        subcommands: {
            setup: { policy: 'admin', denied: '❌ You don\'t have permission to run this.' },
            reindex: { policy: 'admin', denied: '❌ You don\'t have permission to run this.' },
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
        // confirm_remove_ / cancel_remove_ (confirming or cancelling the removal of a memorial; it used to be listed under
        // misc): the handler checks the person who started the removal.
        prefix: routes('open', deletions.prefix, { gate: 'own: the person who started the removal' }),
    },
    modals: {
        exact: {
            characterSubmission_1: route('open', (i, c) => require('./modals/characterSubmission_1')(i, c)),
            characterSubmission_2: route('open', (i, c) => require('./modals/characterSubmission_2')(i, c)),
            tlrRemoveModal: route('open', (i) => require('./buttons').handleRemoveModalSubmit(i), { gate: 'own: author, or tlr_mod' }),
        },
    },
    selects: {
        exact: { tlrRemoveSelect: route('open', (i) => require('./buttons').handleRemoveSelect(i), { gate: 'own: author, or tlr_mod' }) },
    },
};
