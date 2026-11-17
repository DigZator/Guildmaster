// The single public entry point for access checks. The router enforces the policies of every route (core/router.js);
// handlers call `auth.can(...)` for the checks that stay inside them (plan section 5.3). Call it as a property of this
// module, not destructured at load, so the route-permission harness can record it. The old utils/isAdminChannel.js is gone.
const { can, getPolicy, knownPolicies, validate } = require('./check');
const { POLICIES, COMBINE_MODES } = require('./policies');
const { CHANNEL_ENV, currentChannelIds } = require('./channels');
const roleVars = require('../../core/roleVars');

module.exports = {
    can, getPolicy, knownPolicies, validate,
    POLICIES, COMBINE_MODES, CHANNEL_ENV, currentChannelIds,
    // One place for role ids and the startup warning about missing ones (the table itself lives in core/roleVars.js).
    ROLE_VARS: roleVars.ROLE_VARS, missingRoles: roleVars.missingRoles, reportMissingRoles: roleVars.report,
};
