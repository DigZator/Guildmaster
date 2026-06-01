const helpData = {
  player: [
    {
      name: '/list_games',
      description: 'Browse upcoming games with open seats.',
      options: [
        '`browsing` — include full/closed games too',
        '`n` — limit number of results shown',
        '`format_filter` — filter by format (e.g. one-shot, campaign)',
        '`type_filter` — filter by type (e.g. Online, In-Person, Play-By-Post)',
        '`public` — post result publicly in the channel',
      ],
    },
    {
      name: '/game_info',
      description: 'Get detailed info about a specific game.',
      options: [
        '`uid` — autocomplete search by game name',
        '`public` — post result publicly in the channel',
      ],
    },
    {
      name: '/ping',
      description: 'Check if Guildmaster is online.',
      options: [],
    },
  ],

  admin: [
    {
      name: '/announce_game',
      description: 'Pull a game from Notion and post it to the quest board.',
      options: [
        '`game` — autocomplete search by game name',
        '`manual` — skip Notion, compose the announcement by hand',
      ],
    },
    {
      name: '/the_long_rest',
      description: 'Start a fallen-character obituary. Posts after mod approval.',
      options: [
        '`add` — begin a new memorial',
        '`remove` — remove a memorial by message ID',
      ],
    },
    {
      name: '/schedule_activation',
      description: 'Manage the scheduled activation queue for games.',
      options: [
        '`add` — queue a game for activation (autocomplete)',
        '`remove` — remove a game from the queue (autocomplete)',
        '`view` — view the current queue',
        '`set-reminder-time` — set daily reminder time in HH:MM IST',
        '`set-activation-time` — set activation time in HH:MM IST',
        '`toggle-reminder` — enable or disable the daily reminder',
        '`status` — show current schedule settings and queue',
      ],
    },
    {
      name: '/rss',
      description: 'Manage RSS feeds polled on an interval.',
      options: [
        '`add` — add a feed with URL, name, and optional channel',
        '`remove` — remove a feed by name or URL',
        '`list` — list all active feeds',
      ],
    },
    {
      name: '/anon_msg',
      description: 'Send and manage anonymous messages.',
      options: [
        '`add` — post anonymously to a channel (with optional key for editing)',
        '`edit` — edit a message by key (autocomplete)',
        '`rmv` — remove a message by key (autocomplete)',
      ],
    },
  ],
};

module.exports = helpData;
