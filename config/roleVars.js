// Every role the code reads from .env, and what silently stops working when it is missing.
// A missing role id never crashes anything: the checks that use it quietly deny everyone, which is hard to
// notice. report() prints one startup warning listing them. It only logs; it changes no behavior.
//
// Adding a new `process.env.SOMETHING_ROLE_ID` anywhere? Add it here too (a test enforces it).

const definitions = [
    { key: 'ADMINS_ROLE_ID', tier: 'core', usedBy: 'bot admin checks, The Long Rest moderation, verification staff, ticket viewers, /create_campaign', effect: 'the role-only admin checks (botAdmin, botChannelAdmin) deny everyone, /create_campaign refuses to run, and the control/league channel checks still work' },
    { key: 'HR_ROLE_ID', tier: 'feature', usedBy: 'the hr check (/direct_line), HR tickets, verification staff', effect: 'the hr check denies everyone and HR tickets have no viewer role' },
    { key: 'CMD_ROLE_ID', tier: 'feature', usedBy: 'the cmd check (/channel_file file and its buttons)', effect: 'the cmd check denies everyone' },
    { key: 'DM_ROLE_ID', tier: 'feature', usedBy: '/leaguedm quest checks, /create_campaign', effect: 'DM checks deny everyone and /create_campaign refuses to run' },
    { key: 'CLERK_OF_MORTAL_AFFAIRS_ROLE_ID', tier: 'feature', usedBy: 'The Long Rest moderation', effect: 'only the admin role can moderate The Long Rest' },
    { key: 'CLANKERS_ROLE_ID', tier: 'feature', usedBy: 'verification staff, /create_campaign', effect: 'Clankers are not treated as verification staff and /create_campaign refuses to run' },
    { key: 'ADVENTURER_ROLE_ID', tier: 'feature', usedBy: '/verification, /create_campaign', effect: '/verification needs the role passed in by hand and /create_campaign refuses to run' },
    { key: 'LEAGUE_PLAYERS_ROLE_ID', tier: 'feature', usedBy: '/league create', effect: 'new league members are not given the player role' },
    { key: 'INVENTORY_ROLE_ID', tier: 'feature', usedBy: 'physical asset tickets', effect: 'physical asset tickets ping nobody' },
    { key: 'TLR_MOD_PING_ROLE_ID', tier: 'feature', usedBy: 'The Long Rest submissions', effect: 'new memorial submissions do not ping a mod role' },
];

const ROLE_VARS = Object.freeze(definitions.map(entry => Object.freeze({ ...entry })));

function missingRoles(env = process.env) {
    return ROLE_VARS.filter(entry => !env[entry.key]);
}

function formatReport(missing) {
    const lines = missing.map(entry => `  - ${entry.key} (${entry.tier}): ${entry.effect}.`);
    return `[roleCheck] ${missing.length} of ${ROLE_VARS.length} role variables are not set in .env:\n${lines.join('\n')}`;
}

// Logs at error level when a core role is missing, otherwise at warn level. Returns what it found.
function report(log = console, env = process.env) {
    const missing = missingRoles(env);
    if (!missing.length) return missing;
    const text = formatReport(missing);
    if (missing.some(entry => entry.tier === 'core')) log.error(text); else log.warn(text);
    return missing;
}

module.exports = { ROLE_VARS, missingRoles, formatReport, report };
