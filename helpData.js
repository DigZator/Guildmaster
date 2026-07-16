module.exports = {

  // ─── /help help about ──────────────────────────────────────────────────
  help: {
    about: {
      label: 'About Help',
      description: 'How commands are organized in Guildmaster, and where to look for what.',
      commands: [
        {
          name: '/help player general',
          description: 'Everyday commands available to everyone — pinging the bot, browsing/finding games, and memorials.',
        },
        {
          name: '/help admin <family>',
          description: 'General server-admin tooling — game announcements, the activation schedule, RSS feeds, and anonymous messaging. Families: game-management, scheduling, rss, messaging.',
        },
        {
          name: '/help league <family>',
          description: 'Player-facing league commands — character setup, inventory, the shop, the marketplace, downtime, gold/balance, and quests. Families: character, inventory, shop, marketplace, downtime, economy, quest.',
        },
        {
          name: '/help leaguedm <family>',
          description: 'Commands for DMs running league quests — managing quest rosters, granting rewards, and creating/importing items. All grants go to admins for approval. Families: quest-management, rewards, items.',
        },
        {
          name: '/help leagueadmin <family>',
          description: 'Commands for league admins — approving pending DM requests, granting rewards directly, managing items, stocking the shop/catalogue, and approving downtime. Families: approvals, rewards, items, shop-catalogue, downtime.',
        },
        {
          name: 'Reading a command signature',
          description: '`<argument>` is required, `[argument]` is optional. E.g. `/league gold <player> <amount>` always needs both; `/league shop browse [rarity] [sort]` can be run with neither.',
        },
      ],
    },
  },

  // ─── /help player general ──────────────────────────────────────────────
  player: {
    general: {
      label: 'General Commands',
      description: 'Available to everyone, in any channel the bot can see.',
      commands: [
        {
          name: '/ping',
          description: 'Check if Guildmaster is online.',
        },
        {
          name: '/list_games [browsing] [n] [format_filter] [type_filter] [public]',
          description: 'Browse upcoming games with open seats. `browsing` includes full/closed games; `n` limits results; filter by format (Online/In-Person/Play-By-Post) or type (One-Shot/Mini-Adventure/Campaign/Workshop); `public` posts the result for everyone instead of just you.',
        },
        {
          name: '/game_info <uid> [public]',
          description: 'Get detailed info about a specific game. `uid` autocompletes by game name; `public` posts the result for everyone instead of just you.',
        },
        {
          name: '/the_long_rest add',
          description: 'Start a fallen-character memorial. Posts after moderator approval.',
        },
        {
          name: '/the_long_rest remove <message_id>',
          description: 'Remove a memorial by its message ID.',
        },
      ],
    },
  },

  // ─── /help admin <family> ───────────────────────────────────────────────
  admin: {
    'game-management': {
      label: 'Game Management',
      description: 'Announcing and editing games on the quest board. General server admins.',
      commands: [
        {
          name: '/announce_game [game] [manual]',
          description: 'Pull a game from Notion and post it to the quest board. `game` autocompletes; `manual` skips Notion and lets you compose the announcement by hand.',
        },
        {
          name: '/edit_game <game> <field>',
          description: 'Edit a field on a game in Notion. Both `game` and `field` autocomplete.',
        },
      ],
    },
    scheduling: {
      label: 'Activation Scheduling',
      description: 'Manage the queue that automatically activates games at a scheduled time.',
      commands: [
        {
          name: '/schedule_activation add <game>',
          description: 'Queue a game for activation. `game` autocompletes.',
        },
        {
          name: '/schedule_activation remove <game>',
          description: 'Remove a game from the activation queue. `game` autocompletes.',
        },
        {
          name: '/schedule_activation view',
          description: 'View the current activation queue.',
        },
        {
          name: '/schedule_activation set-reminder-time <time>',
          description: 'Set the daily reminder time. `time` in HH:MM, IST, 24-hour format.',
        },
        {
          name: '/schedule_activation set-activation-time <time>',
          description: 'Set the activation time. `time` in HH:MM, IST, 24-hour format.',
        },
        {
          name: '/schedule_activation toggle-reminder',
          description: 'Enable or disable the daily reminder.',
        },
        {
          name: '/schedule_activation toggle-auto',
          description: 'Enable or disable auto-scheduling games on announcement.',
        },
        {
          name: '/schedule_activation status',
          description: 'Show current schedule settings and the queue.',
        },
      ],
    },
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
          name: '/anon_msg add <channel> [key] [content] [multiline]',
          description: 'Post anonymously to a channel. `key` lets you edit it later; `content` is a single-line message, or set `multiline` to compose it interactively in triple backticks instead.',
        },
        {
          name: '/anon_msg edit <key>',
          description: 'Edit a previously sent message. `key` autocompletes.',
        },
        {
          name: '/anon_msg rmv <key>',
          description: 'Remove a previously sent message. `key` autocompletes.',
        },
      ],
    },
  },

  // ─── /help league <family> ──────────────────────────────────────────────
  league: {
    character: {
      label: 'Character',
      description: 'Register and manage your league character.',
      commands: [
        {
          name: '/league create',
          description: 'Register your character in the Adventurer\'s Guild League.',
        },
        {
          name: '/league profile [user]',
          description: 'View your character profile, or someone else\'s if `user` is given.',
        },
        {
          name: '/league edit [name] [class] [background] [charsheet]',
          description: 'Update any of your character\'s name, class, background, or character sheet link. Only the fields you provide are changed.',
        },
        {
          name: '/league setart <image>',
          description: 'Set your character\'s profile art. No AI-generated images.',
        },
      ],
    },
    inventory: {
      label: 'Inventory',
      description: 'View what your character is carrying.',
      commands: [
        {
          name: '/league inv',
          description: 'View your full inventory.',
        },
        {
          name: '/league item <id> [public]',
          description: 'View details of one item, by its number from `/league inv`. `public` shows it to the channel instead of just you.',
        },
      ],
    },
    shop: {
      label: 'Guild Shop',
      description: 'Buy items directly from the guild-stocked shop.',
      commands: [
        {
          name: '/league shop browse [rarity] [sort]',
          description: 'Browse what\'s currently in stock. Filter by rarity, sort by price or name.',
        },
        {
          name: '/league shop search <name>',
          description: 'Search the full item catalogue by name — includes items not currently stocked.',
        },
        {
          name: '/league shop info <code>',
          description: 'View full details of an item by its catalogue code (from `search` or `browse`).',
        },
        {
          name: '/league shop buy <id>',
          description: 'Buy an item from the shop by its shop listing ID.',
        },
        {
          name: '/league shop sell <id>',
          description: 'Sell an item from your inventory to the shop by its inventory ID.',
        },
      ],
    },
    marketplace: {
      label: 'Player Marketplace',
      description: 'Buy and sell items directly between players. A tax is deducted from the seller\'s proceeds on every sale.',
      commands: [
        {
          name: '/league marketplace browse [rarity] [sort]',
          description: 'Browse active player listings. Filter by rarity, sort by price or newest.',
        },
        {
          name: '/league marketplace buy <id>',
          description: 'Buy a listing by its ID. You pay the full asking price.',
        },
        {
          name: '/league marketplace list <item_id> <price>',
          description: 'List an item from your inventory for a given asking price in gp.',
        },
        {
          name: '/league marketplace unlist <id>',
          description: 'Remove one of your own listings.',
        },
      ],
    },
    downtime: {
      label: 'Downtime',
      description: 'Run downtime activities between quests.',
      commands: [
        {
          name: '/league downtime start <activity>',
          description: 'Begin a downtime activity by its ID.',
        },
        {
          name: '/league downtime progress <id> <days>',
          description: 'Invest days into an activity you\'ve already started, by its DTA ID.',
        },
        {
          name: '/league downtime list',
          description: 'View your currently active downtime activities.',
        },
      ],
    },
    economy: {
      label: 'Gold & Balance',
      description: 'Your character\'s currency.',
      commands: [
        {
          name: '/league gold <player> <amount>',
          description: 'Transfer gold from your character to another player\'s.',
        },
        {
          name: '/league balance',
          description: 'Check your gold, reputation, and milestones.',
        },
      ],
    },
    quest: {
      label: 'Quests',
      description: 'League quest information.',
      commands: [
        {
          name: '/league quest list',
          description: 'View the 15 most recent league quests, their status, and date.',
        },
        {
          name: '/league log',
          description: 'View your personal quest log. (Coming soon)',
        },
      ],
    },
  },

  // ─── /help leaguedm <family> ─────────────────────────────────────────────
  leaguedm: {
    'quest-management': {
      label: 'Quest Management',
      description:
        'Requires the DM role.\n\n' +
        'The intended workflow for running a league quest:\n' +
        '1. **Link** the announced game to the quest log with `link`, so it gets a quest ID.\n' +
        '2. **Add** the players who are on the quest with `add`.\n' +
        '3. While the quest runs, grant rewards as they\'re earned via `/leaguedm gold`, `rep`, `milestone`, or `item create`/`item import` — each goes to admins for approval.\n' +
        '4. Only once rewards are settled, **complete** the quest — this is logged for admins and still requires approval before it\'s finalized.\n' +
        'Use `remove`/`clear` if the roster needs correcting before completion.',
      commands: [
        {
          name: '/leaguedm quest link <game> [notes]',
          description: 'Link an announced game to the league quest log, creating a quest ID. `game` autocompletes.',
        },
        {
          name: '/leaguedm quest add <quest_id> <user1> [user2..6]',
          description: 'Add up to 6 players to a quest\'s roster.',
        },
        {
          name: '/leaguedm quest remove <quest_id> <user1> [user2..6]',
          description: 'Remove up to 6 players from a quest\'s roster.',
        },
        {
          name: '/leaguedm quest clear <quest_id>',
          description: 'Remove every player from a quest\'s roster.',
        },
        {
          name: '/leaguedm quest complete <quest_id> <milestones> <reputation>',
          description: 'Mark a quest as completed, logging the total milestones/reputation given out this quest for admin review. Do this last, after rewards are granted — this only logs the totals, it does not distribute them; use gold/rep/milestone/item for that.',
        },
      ],
    },
    rewards: {
      label: 'Rewards',
      description: 'Requires the DM role. All grants here are submitted for admin approval before they take effect.',
      commands: [
        {
          name: '/leaguedm gold <quest_id> <user1> <amount1> [user2..6] [amount2..6]',
          description: 'Request a gold grant (gp) for up to 6 players on a quest.',
        },
        {
          name: '/leaguedm rep <quest_id> <user1> <amount1> [user2..6] [amount2..6]',
          description: 'Request a reputation grant (max 2 each) for up to 6 players on a quest.',
        },
        {
          name: '/leaguedm milestone <quest_id> <user1> <amount1> [user2..6] [amount2..6]',
          description: 'Request a milestone grant for up to 6 players on a quest.',
        },
      ],
    },
    items: {
      label: 'Items',
      description: 'Requires the DM role. Both submit for admin approval before the item is created.',
      commands: [
        {
          name: '/leaguedm item create <quest_id> <name> <type> <rarity> <player> [subtype] [source] [value] [notes]',
          description: 'Request a hand-made item, fully specified by you, for a player on a quest.',
        },
        {
          name: '/leaguedm item import <quest_id> <code> <player> [value] [source] [notes]',
          description: 'Request an item sourced directly from the 5e catalogue for a player on a quest — name, type, and rarity come from the catalogue automatically.',
        },
      ],
    },
  },

  // ─── /help leagueadmin <family> ──────────────────────────────────────────
  leagueadmin: {
    approvals: {
      label: 'Approvals',
      description:
        'Requires the Admin role, used in the league admin channel.\n\n' +
        'Every DM-submitted grant (gold, reputation, milestones, items, quest completion) and every player downtime request lands in the pending queue rather than taking effect immediately. Use `pending` to see what\'s waiting, then `approve` or `reject` by action ID to resolve it. Approving finalizes the change (e.g. actually creates the item, or applies the gold); rejecting discards it with no effect.',
      commands: [
        {
          name: '/leagueadmin pending',
          description: 'List all pending DM grant actions awaiting approval.',
        },
        {
          name: '/leagueadmin approve <id>',
          description: 'Approve one or more pending actions by ID (comma-separated, e.g. "34, 756").',
        },
        {
          name: '/leagueadmin reject <id>',
          description: 'Reject one or more pending actions by ID (comma-separated, e.g. "34, 756").',
        },
      ],
    },
    rewards: {
      label: 'Rewards',
      description: 'Requires the Admin role. Unlike the DM versions, these apply immediately — no approval step.',
      commands: [
        {
          name: '/leagueadmin gold <user> <amount>',
          description: 'Grant gold (gp) to a player directly. Negative amounts are allowed.',
        },
        {
          name: '/leagueadmin rep <user> <amount>',
          description: 'Grant reputation (max 2) to a player directly.',
        },
        {
          name: '/leagueadmin milestone <user> <amount>',
          description: 'Grant milestones to a player directly.',
        },
      ],
    },
    items: {
      label: 'Items',
      description: 'Requires the Admin role. Both create the item immediately — no approval step.',
      commands: [
        {
          name: '/leagueadmin item create <name> <type> <rarity> [player] [subtype] [source] [value] [notes]',
          description: 'Create a hand-made item, fully specified by you. `player` is optional — leave it out to create an unassigned item.',
        },
        {
          name: '/leagueadmin item import <code> [player] [value] [source] [notes]',
          description: 'Import an item directly from the 5e catalogue — name, type, and rarity come from the catalogue automatically. `player` is optional.',
        },
      ],
    },
    'shop-catalogue': {
      label: 'Shop & Catalogue',
      description: 'Requires the Admin role. Manage what\'s in the guild shop and keep the underlying item catalogue up to date.',
      commands: [
        {
          name: '/leagueadmin shop stock <code> <quantity> [price]',
          description: 'Add or update an item on the shop floor from the catalogue. `price` overrides the default SRD price.',
        },
        {
          name: '/leagueadmin shop stockall [rarity]',
          description: 'Bulk-stock the whole catalogue, or just one rarity, at rarity-default quantities.',
        },
        {
          name: '/leagueadmin shop unstock <code>',
          description: 'Remove an item from the shop floor by its shop item ID.',
        },
        {
          name: '/leagueadmin shop restock <code>',
          description: 'Manually trigger a restock for one shop item.',
        },
        {
          name: '/leagueadmin catalogue sync',
          description: 'Refresh the item catalogue from the 5e source data.',
        },
      ],
    },
    downtime: {
      label: 'Downtime',
      description: 'Requires the Admin role.',
      commands: [
        {
          name: '/leagueadmin downtime approve <id>',
          description: 'Approve a pending downtime start or completion request, by request ID or DTA ID.',
        },
      ],
    },
  },

};
