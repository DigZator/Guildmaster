// The single public entry point for access checks. Phase 2 only: nothing calls this yet, and the old helpers
// (utils/isAdminChannel.js, config/tlrRoles.js) keep working unchanged until callers are migrated in Phase 3.
const { can, getPolicy, knownPolicies, validate } = require('./check');
const { POLICIES, COMBINE_MODES } = require('./policies');
const { CHANNEL_ENV, currentChannelIds } = require('./channels');
const roleVars = require('../../config/roleVars');

module.exports = {
    can, getPolicy, knownPolicies, validate,
    POLICIES, COMBINE_MODES, CHANNEL_ENV, currentChannelIds,
    // One place for role ids and the startup warning about missing ones (absorbs config/roleVars.js in Phase 3).
    ROLE_VARS: roleVars.ROLE_VARS, missingRoles: roleVars.missingRoles, reportMissingRoles: roleVars.report,
};
