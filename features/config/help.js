// /help text of the config feature. helpData.js spreads `admin` into its admin group, in this position.
module.exports = {
  admin: {
    config: {
      label: 'Channel Configuration',
      description: 'Change where the bot sends things (logs, quest board, feeds and so on) without editing `.env`. Requires the Admin role. Changes are saved and take effect the next time the bot restarts. The control and league-admin channels, roles and secrets stay in `.env`.',
      commands: [
        {
          name: '/config status',
          description: 'Show every channel mapping with its current channel, where that value comes from, whether it looks healthy, and any saved change that is waiting for a restart.',
        },
        {
          name: '/config set <key> <channel>',
          description: 'Point a mapping at a different channel. The channel is checked first (right type, this server, bot permissions) and nothing is saved if it fails. Changing the trap channel asks you to confirm. Each change is recorded in the bot log.',
        },
        {
          name: '/config clear <key>',
          description: 'Remove a saved override, so the `.env` value is used again after the next restart.',
        },
      ],
    },
  },
};
