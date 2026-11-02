// Deterministic, offline environment for tests. Loaded before any bot module.
// Secrets are forced to dummies so a test can never reach Discord or Notion.
const testEnv = {
    DISCORD_TOKEN: 'test-token',
    NOTION_TOKEN: 'test-token',
    FILLOUT_API_KEY: 'test-key',
    CLIENT_ID: '100000000000000001',
    GUILD_ID: '100000000000000002',
    DEV_MODE: 'false',
    ADMINS_ROLE_ID: '200000000000000001',
    HR_ROLE_ID: '200000000000000002',
    CMD_ROLE_ID: '200000000000000003',
    TRAP_CHANNEL_ID: '300000000000000001',
    BOT_LOG_CHANNEL_ID: '300000000000000002',
    GUILDMASTER_CTRL_CHANNEL_ID: '300000000000000003',
    LEAGUE_ADMIN_CHANNEL_ID: '300000000000000004',
    ADMIN_CHECK_MODE_BOT: 'either',
    ADMIN_CHECK_MODE_LEAGUE: 'either',
};
Object.assign(process.env, testEnv);
module.exports = { testEnv };
