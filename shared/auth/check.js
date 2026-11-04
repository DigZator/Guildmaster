const { POLICIES, COMBINE_MODES } = require('./policies');
const { CHANNEL_ENV, channelIdsFor, currentChannelIds } = require('./channels');
const { ROLE_VARS } = require('../../config/roleVars');

function knownPolicies() {
    return Object.keys(POLICIES);
}

// An unknown policy name is a programming error, so it throws instead of silently denying everyone.
function getPolicy(name) {
    const policy = POLICIES[name];
    if (!policy) throw new Error(`[auth] Unknown policy "${name}". Known policies: ${knownPolicies().join(', ')}.`);
    return policy;
}

function roleIdsFor(keys, env = process.env) {
    return keys.map(key => env[key]).filter(Boolean);
}

// Today a typo in ADMIN_CHECK_MODE_* silently becomes "channel only". That is kept (behavior is identical),
// and validate() reports it.
function effectiveCombine(policy, env = process.env) {
    if (!policy.modeEnv) return policy.combine;
    const configured = env[policy.modeEnv] || policy.combine;
    return COMBINE_MODES.includes(configured) ? configured : 'channel';
}

function hasRole(interaction, policy, env) {
    const roleIds = roleIdsFor(policy.who, env);
    if (roleIds.length === 0) return false;
    return interaction?.member?.roles?.cache?.some(role => roleIds.includes(role.id)) ?? false;
}

function inChannel(interaction, policy, env) {
    const channels = channelIdsFor(policy.where, env);
    return currentChannelIds(interaction).some(id => channels.includes(id));
}

// Does this interaction pass the named policy?
function can(policyName, interaction, env = process.env) {
    const policy = getPolicy(policyName);
    switch (effectiveCombine(policy, env)) {
        case 'open':
            return true;
        case 'role':
            return hasRole(interaction, policy, env);
        case 'either':
            return hasRole(interaction, policy, env) || inChannel(interaction, policy, env);
        case 'both':
            return hasRole(interaction, policy, env) && inChannel(interaction, policy, env);
        case 'channel':
        default:
            return inChannel(interaction, policy, env);
    }
}

// Everything that can be checked without a live bot. Returns a list of problems (empty = fine).
// Intended for the startup log and for the test suite; it never throws and changes nothing.
function validate(policies = POLICIES, env = process.env) {
    const problems = [];
    const registered = new Set(ROLE_VARS.map(entry => entry.key));
    for (const policy of Object.values(policies)) {
        for (const key of policy.who) {
            if (!registered.has(key)) problems.push(`policy "${policy.name}" uses role variable ${key}, which is not in config/roleVars.js`);
        }
        for (const key of policy.where) {
            if (!CHANNEL_ENV[key]) problems.push(`policy "${policy.name}" uses unknown channel key "${key}"`);
        }
        if (policy.combine !== 'open' && !COMBINE_MODES.includes(policy.combine)) {
            problems.push(`policy "${policy.name}" has unknown combine mode "${policy.combine}"`);
        }
        if (policy.modeEnv && env[policy.modeEnv] && !COMBINE_MODES.includes(env[policy.modeEnv])) {
            problems.push(`${policy.modeEnv}="${env[policy.modeEnv]}" is not one of ${COMBINE_MODES.join('/')}; the check falls back to channel-only`);
        }
    }
    return problems;
}

module.exports = { can, getPolicy, knownPolicies, validate };
