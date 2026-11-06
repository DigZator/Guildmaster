// /help text of the messaging feature. helpData.js spreads `admin` into its admin group, in this order.
module.exports = {
  admin: {
    rss: {
      label: 'RSS Feed Management',
      description: 'Manage RSS feeds that get polled on an interval and posted to a channel.',
      commands: [
        {
          name: '/rss add <url> <name> [channel]',
          description: 'Add a new feed. `channel` defaults to #feeds if omitted.',
        },
        {
          name: '/rss remove <query>',
          description: 'Remove a feed by name or URL.',
        },
        {
          name: '/rss list',
          description: 'List all active feeds.',
        },
      ],
    },
    messaging: {
      label: 'Anonymous Messaging',
      description: 'Send and manage anonymous messages posted through the bot.',
      commands: [
        {
          name: '/anon_msg add <channel> [key] [content] [multiline] [mentions]',
          description: 'Post anonymously to a channel. `key` lets you edit it later (max 80 characters); `content` is a single-line message, or set `multiline` to compose it interactively in triple backticks instead. Mentions are off unless you set `mentions` to true. Every send, edit and removal is logged privately in guildmaster-ctrl.',
        },
        {
          name: '/anon_msg edit <key> [mentions]',
          description: 'Edit a previously sent message. `key` autocompletes. Set `mentions` to true to let mentions in the new text ping.',
        },
        {
          name: '/anon_msg rmv <key>',
          description: 'Remove a previously sent message. `key` autocompletes.',
        },
      ],
    },
  },
};
