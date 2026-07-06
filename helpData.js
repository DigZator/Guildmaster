const helpData = {
  player: [
    {
      name: '/ping',
      description: 'Check if Guildmaster is online.',
      options: [],
    },
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
      name: '/the_long_rest',
      description: 'Start a fallen-character obituary. Posts after mod approval.',
      options: [
        '`add` — begin a new memorial',
        '`remove` — remove a memorial by message ID',
      ],
    },
  ],
  
  league: [
    {
      name: '/league create',
      description: 'Register your character in the Adventuring Guild League.',
      options: [],
    },
    {
      name: '/league profile',
      description: 'View your character profile.',
      options: [
        '`user` — view another player\'s profile',
      ],
    },
    {
      name: '/league edit',
      description: 'Edit your character details.',
      options: [
        '`name` — update character name',
        '`art` — update character art URL',
      ],
    },
    {
      name: '/league balance',
      description: 'Check your gold, reputation, and milestones.',
      options: [],
    },
    {
      name: '/league quest list',
      description: 'View the 15 most recent league quests with status and date.',
      options: [],
    },
  ],

  leaguedm: [
    {
      name: '/leaguedm quest link',
      description: 'Link an announced game to the league quest log (pending admin approval).',
      options: [
        '`game` — autocomplete search by game name',
        '`notes` — optional notes for the admin',
      ],
    },
    {
      name: '/leaguedm quest add',
      description: 'Add players to a quest\'s character roster.',
      options: [
        '`quest_id` — the Quest ID',
        '`user1`–`user6` — players to add',
      ],
    },
    {
      name: '/leaguedm quest remove',
      description: 'Remove a player from a quest\'s character roster.',
      options: [
        '`quest_id` — the Quest ID',
        '`user` — player to remove',
      ],
    },
    {
      name: '/leaguedm quest clear',
      description: 'Remove all players from a quest\'s character roster.',
      options: [
        '`quest_id` — the Quest ID',
      ],
    },
    {
      name: '/leaguedm quest complete',
      description: 'Submit a quest for completion (requires admin approval). Shows a summary before confirming.',
      options: [
        '`quest_id` — the Quest ID',
        '`milestones` — total milestones given out this quest',
        '`reputation` — total reputation given out this quest',
      ],
    },
    {
      name: '/leaguedm gold',
      description: 'Submit a gold grant for one or more players (pending admin approval).',
      options: [
        '`quest_id` — Quest ID this grant is tied to',
        '`user1`–`user6` + `amount1`–`amount6` — players and amounts',
      ],
    },
    {
      name: '/leaguedm rep',
      description: 'Submit a reputation grant for one or more players (pending admin approval).',
      options: [
        '`quest_id` — Quest ID this grant is tied to',
        '`user1`–`user6` + `amount1`–`amount6` — players and amounts (max 2 each)',
      ],
    },
    {
      name: '/leaguedm milestone',
      description: 'Submit a milestone grant for one or more players (pending admin approval).',
      options: [
        '`quest_id` — Quest ID this grant is tied to',
        '`user1`–`user6` + `amount1`–`amount6` — players and amounts',
      ],
    },
    {
      name: '/leaguedm item create',
      description: 'Submit an item grant for a player (pending admin approval).',
      options: [
        '`quest_id` — Quest ID this item is tied to',
        '`name`, `type`, `rarity` — item details',
        '`player` — target player',
        '`subtype`, `source`, `value`, `notes` — optional details',
      ],
    },
  ],

  leagueadmin: [
    {
      name: '/leagueadmin pending',
      description: 'List all pending DM grant actions awaiting approval.',
      options: [],
    },
    {
      name: '/leagueadmin approve',
      description: 'Approve one or more pending actions.',
      options: [
        '`id` — action ID or comma-separated list of IDs',
      ],
    },
    {
      name: '/leagueadmin reject',
      description: 'Reject one or more pending actions.',
      options: [
        '`id` — action ID or comma-separated list of IDs',
      ],
    },
    {
      name: '/leagueadmin gold',
      description: 'Directly grant or deduct gold from a character (no approval needed).',
      options: [
        '`user` — target player',
        '`amount` — amount in gp (can be negative)',
      ],
    },
    {
      name: '/leagueadmin rep',
      description: 'Directly grant reputation to a character (no approval needed).',
      options: [
        '`user` — target player',
        '`amount` — amount (max 2)',
      ],
    },
    {
      name: '/leagueadmin milestone',
      description: 'Directly grant milestones to a character (no approval needed).',
      options: [
        '`user` — target player',
        '`amount` — number of milestones',
      ],
    },
    {
      name: '/leagueadmin item create',
      description: 'Create and optionally assign an inventory item directly.',
      options: [
        '`name`, `type`, `rarity` — item details',
        '`player` — assign to a player (optional)',
        '`subtype`, `source`, `value`, `notes` — optional details',
      ],
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
      name: '/schedule_activation',
      description: 'Manage the scheduled activation queue for games.',
      options: [
        '`add` — queue a game for activation (autocomplete)',
        '`remove` — remove a game from the queue (autocomplete)',
        '`view` — view the current queue',
        '`set-reminder-time` — set daily reminder time in HH:MM IST',
        '`set-activation-time` — set activation time in HH:MM IST',
        '`toggle-reminder` — enable or disable the daily reminder',
        '`toggle-auto` — enable or disable the auto-scheduler',
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
