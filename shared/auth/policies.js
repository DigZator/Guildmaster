// Named access policies. Each one answers two independent questions:
//   who   - which roles (by the role variable's name, e.g. 'ADMINS_ROLE_ID'); any one of them is enough
//   where - which channels (by key, see CHANNEL_ENV in channels.js); a thread counts as its parent channel
// and says how the two combine: 'role' (roles only), 'channel' (channels only), 'either', 'both'.
// 'open' lets everyone through.
//
// Phase 2 encodes TODAY'S behavior only. `legacy` names the utils/isAdminChannel.js type each policy
// reproduces, so a test can prove the two agree. Rules that are meant to change later (refactor plan, section 6)
// are not here yet: they arrive as separate changes, each as its own policy or route declaration.
//
// `modeEnv` marks the two policies whose combine mode can be overridden from .env today
// (ADMIN_CHECK_MODE_BOT / ADMIN_CHECK_MODE_LEAGUE). That override stays until the legacy policies go away.

const COMBINE_MODES = Object.freeze(['role', 'channel', 'either', 'both']);

const definitions = {
    open: { who: [], where: [], combine: 'open' },

    // Admins role only (isAdminChannel "botAdmin").
    admin: { who: ['ADMINS_ROLE_ID'], where: [], combine: 'role', legacy: 'botAdmin' },

    // Admins role AND the control channel (isAdminChannel "botChannelAdmin").
    admin_ctrl: { who: ['ADMINS_ROLE_ID'], where: ['ctrl'], combine: 'both', legacy: 'botChannelAdmin' },

    // Admins role OR the control channel (isAdminChannel "bot", also the default type). Kept so the quirk
    // that a channel alone grants access is visible in exactly one place.
    bot_legacy: { who: ['ADMINS_ROLE_ID'], where: ['ctrl'], combine: 'either', modeEnv: 'ADMIN_CHECK_MODE_BOT', legacy: 'bot' },

    // Admins role OR the league-admin channel OR the control channel (isAdminChannel "league").
    league_legacy: { who: ['ADMINS_ROLE_ID'], where: ['league_admin', 'ctrl'], combine: 'either', modeEnv: 'ADMIN_CHECK_MODE_LEAGUE', legacy: 'league' },

    hr: { who: ['HR_ROLE_ID'], where: [], combine: 'role', legacy: 'hr' },
    cmd: { who: ['CMD_ROLE_ID'], where: [], combine: 'role', legacy: 'cmd' },

    // The Long Rest moderators: Admins or Clerk of Mortal Affairs (config/tlrRoles.js isTlrMod).
    tlr_mod: { who: ['ADMINS_ROLE_ID', 'CLERK_OF_MORTAL_AFFAIRS_ROLE_ID'], where: [], combine: 'role' },
};

const POLICIES = Object.freeze(Object.fromEntries(
    Object.entries(definitions).map(([name, def]) => [name, Object.freeze({ legacy: null, modeEnv: null, name, ...def, who: Object.freeze([...def.who]), where: Object.freeze([...def.where]) })]),
));

module.exports = { POLICIES, COMBINE_MODES };
