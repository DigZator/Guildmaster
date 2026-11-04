// Channel keys used by policies, and the helpers that read them. Everything reads the environment at call
// time (and takes it as a parameter), so tests can inject their own and nothing is captured at load.
// These gates stay in .env on purpose: no command may change them (refactor plan, section 14).

const CHANNEL_ENV = Object.freeze({
    ctrl: 'GUILDMASTER_CTRL_CHANNEL_ID',
    league_admin: 'LEAGUE_ADMIN_CHANNEL_ID',
});

function channelIdsFor(keys, env = process.env) {
    return keys.map(key => env[CHANNEL_ENV[key]]).filter(Boolean);
}

// The ids this interaction counts as being "in": its own channel, plus the parent channel when it happens
// inside a thread. channelId is always present on an interaction, so an uncached channel does not throw.
function currentChannelIds(interaction) {
    const ids = [];
    const id = interaction?.channelId ?? interaction?.channel?.id;
    if (id) ids.push(id);
    const channel = interaction?.channel;
    if (channel?.isThread?.() && channel.parentId) ids.push(channel.parentId);
    return ids;
}

module.exports = { CHANNEL_ENV, channelIdsFor, currentChannelIds };
