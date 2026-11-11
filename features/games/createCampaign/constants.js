const ADMINS_ROLE_ID     = process.env.ADMINS_ROLE_ID;
const CLANKERS_ROLE_ID   = process.env.CLANKERS_ROLE_ID;
const ADVENTURER_ROLE_ID = process.env.ADVENTURER_ROLE_ID;
const DM_ROLE_ID         = process.env.DM_ROLE_ID;

const MAX_PLAYERS       = 6;
const MAX_NAME_LENGTH   = 92;     // "[Table] " (8 chars) + name - 100-char channel limit
const GUILD_ROLE_LIMIT  = 250;
const GUILD_CHAN_LIMIT  = 500;
const EMBED_BUDGET      = 5500;   // Discord caps a message's embeds at 6000 characters

const ICON = {
    ok:         '✅',
    failed:     '❌',
    skipped:    '⏭️',
    warn:       '⚠️',
    rolledback: '🗑️',
    rbfailed:   '🚨',
};

const ERROR_HINTS = {
    10003: 'the channel no longer exists',
    10011: 'the role no longer exists',
    30005: 'the server has reached the 250 role limit',
    30013: 'the server has reached the 500 channel limit',
    30015: 'that category already has the maximum number of channels',
    50001: 'the bot cannot see/access that object',
    50013: 'the bot is missing a permission or its role is too low in the role list',
    50035: 'Discord rejected the request as invalid',
};

const PLACEHOLDER_CAMPAIGN_ROLE = 'campaign-role-not-created-yet';   // stands in for the role in the predicted matrix

module.exports = {
    ADMINS_ROLE_ID,
    CLANKERS_ROLE_ID,
    ADVENTURER_ROLE_ID,
    DM_ROLE_ID,
    MAX_PLAYERS,
    MAX_NAME_LENGTH,
    GUILD_ROLE_LIMIT,
    GUILD_CHAN_LIMIT,
    EMBED_BUDGET,
    ICON,
    ERROR_HINTS,
    PLACEHOLDER_CAMPAIGN_ROLE,
};
