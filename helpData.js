module.exports = {

  // ─── /help help about ──────────────────────────────────────────────────
  help: {
    about: {
      label: 'About Help',
      description: 'How commands are organized in Guildmaster, and where to look for what.',
      commands: [
        {
          name: '/help player <family>',
          description: 'Everyday commands available to everyone — pinging the bot, browsing/finding games, memorials, and raising or closing support tickets. Families: general, tickets.',
        },
        {
          name: '/help admin <family>',
          description: 'General server-admin tooling — game announcements, the activation schedule, RSS feeds, anonymous messaging, support tickets, channel archiving, and filing whole channels into threads. Families: game-management, scheduling, rss, messaging, tickets, archive, channel-file.',
        },
        {
          name: '/help league <family>',
          description: 'Player-facing league commands — character setup, inventory, the shop, the marketplace, downtime, gold/balance, quests, and voiding your own items/gold. Families: character, inventory, shop, marketplace, downtime, economy, quest, void.',
        },
        {
          name: '/help leaguedm <family>',
          description: 'Commands for DMs running league quests — link a game to get a quest ID, then do everything else (roster, rewards, completion) from the live dashboard. All of it goes to admins for approval. Family: quest-management.',
        },
        {
          name: '/help leagueadmin <family>',
          description: 'Commands for league admins — approving pending DM requests (including downtime), granting rewards directly, managing items, stocking the shop/catalogue, and data-integrity checks. Families: approvals, rewards, items, shop-catalogue, audit.',
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
          name: '/keep_alive',
          description: 'Use inside a thread to toggle Keep Alive. While on, the thread is never archived for inactivity — meant for campaign threads that must stay permanently open. A notice is posted in the thread each time it is switched on or off. Run it again to switch it off. Misuse may result in administrative action.',
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
        {
          name: '/the_long_rest setup',
          description: 'Admin only. Post (or refresh) the button dashboard for submitting/removing memorials, so players don\'t need the slash commands above.',
        },
        {
          name: '/the_long_rest reindex',
          description: 'Admin only. Rebuild the memorial lookup index by scanning the output channel — run once after adding the removal dashboard button, to backfill memorials posted before it existed.',
        },
      ],
    },
    // tickets: help text of the tickets feature
    ...require('./features/tickets').help.player,
  },

  // ─── /help admin <family> ───────────────────────────────────────────────
  admin: {
    'game-management': {
      label: 'Game Management',
      description: 'Announcing and editing games on the quest board. General server admins.',
      commands: [
        {
          name: '/announce_game <game>',
          description: 'Pull a game from Notion and post it to the quest board. `game` autocompletes. The preview warns about missing fields, and Edit lets you fix them before confirming.',
        },
        {
          name: '/edit_game <game> <field>',
          description: 'Edit a field on a game in Notion. Both `game` and `field` autocomplete — includes Registration Link and Registration Line. Text/number/date fields open a form; checkbox fields (e.g. Activate) show True/False buttons instead. Cover Art has no form: send an image in the channel (or paste a link to one) and it is re-hosted at Notion; type `cancel` to abort.',
        },
        {
          name: '/get_players <game>',
          description: 'Get the list of players who have registered for a game. Also posted automatically (non-ephemeral) to the guildmaster-ctrl channel whenever a game\'s open seats hit zero.',
        },
        {
          name: '/create_campaign <spectators_read_chat> <spectators_send_messages> <spectators_join_voice> [name] [use_stage] [dm]',
          description: 'Create a campaign role, category, text channel, and voice/stage channel. The three spectator questions are required: whether the Adventurer (spectator) role can read the text chat, send messages there (only takes effect if they can read it), and join the voice/stage channel. `use_stage` (default No) creates a Stage channel instead of Voice and gives the whole campaign role speaker/moderator access so they can go live without requesting to speak. `dm`, if set, immediately grants that user the DM role and adds them to the campaign.',
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
        {
          name: '/schedule_activation run-now [announce]',
          description: 'Force the activation job to run immediately for every game in the queue, ignoring the once-a-day limit. `announce` (default Yes) controls whether the WhatsApp copy and quest-board post go out; set No to activate silently.',
        },
      ],
    },
    // rss and messaging: help text of the messaging feature
    ...require('./features/messaging').help.admin,
    // tickets: help text of the tickets feature
    ...require('./features/tickets').help.admin,
    // archive: help text of the archive feature
    ...require('./features/archive').help.admin,
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
    // channel-file: help text of the channel-file feature
    ...require('./features/channelFile').help.admin,
  },

  // ─── /help league <family> ──────────────────────────────────────────────
  league: {
    character: {
      label: 'Character',
      description: 'Register and manage your league character.',
      commands: [
        {
          name: '/league create',
          description: 'Register your character in the Adventurer\'s Guild League. Run inside your character profile thread in #character-profiles. After registering, run `/league starter-items` to claim your starting equipment — the character dashboard will show a warning until you do.',
        },
        {
          name: '/league profile [user]',
          description: 'View your character profile, or someone else\'s if `user` is given.',
        },
        {
          name: '/league edit [name] [class] [species] [background] [charsheet]',
          description: 'Update any of your character\'s name, class, species, background, or character sheet link. Only the fields you provide are changed.',
        },
        {
          name: '/league setart <image>',
          description: 'Set your character\'s profile art. No AI-generated images.',
        },
        {
          name: '/league starter-items <class> <background>',
          description: 'Claim your character\'s starting equipment based on class and background. Walks you through any choices (e.g. weapon or pack options) via buttons/dropdowns, then adds the resulting items and gold to your inventory. Can only be claimed once per character.',
        },
        {
          name: '/league character status <character> <new_status>',
          description: 'Change one of your characters\' status (e.g. Active/Inactive). `character` autocompletes to your own characters.',
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
          name: '/league shop sell [item] [item_id]',
          description: 'Sell item(s) from your inventory to the shop for half value. `item` autocompletes to a single item. `item_id` is a legacy fallback for selling multiple items at once by their positional numbers (e.g. "001,003") — may fail if your inventory has changed since you last listed it.',
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
          name: '/league downtime start <activity> [tier] [spell] [item] [quantity]',
          description:
            'Begin a downtime activity — no more IDs to look up. Start typing in `activity` and pick from the list. If that activity has options (a rarity, a spell level, a tool, etc.), a `tier` field appears next — fill in `activity` first, then autocomplete `tier` narrows to just that activity\'s options. ' +
            '`spell` is required for Scribe a Spell Scroll and `item` is required for Craft a Magic Item (both autocomplete). `quantity` only applies to crafting activities (default 1). ' +
            'Magic item crafting, mundane item crafting, and spell scroll scribing always require admin approval before they start, since the bot can\'t verify prerequisites against your character sheet — an admin resolves this with `/leagueadmin approve` or `/leagueadmin reject`, and you\'ll be notified either way.',
        },
        {
          name: '/league downtime progress <id> <days>',
          description: 'Invest days into an activity you\'ve already started, by its DTA ID. Some activities also require admin sign-off when they finish — you\'ll be notified either way.',
        },
        {
          name: '/league downtime list',
          description: 'View your downtime activities: in progress, awaiting completion approval, and awaiting start approval — each with quantity/spell/item spelled out where relevant.',
        },
        {
          name: '/league downtime buy-days',
          description: 'Spend 1 reputation point for 10 more downtime days. Confirm with the button that appears.',
        },
        {
          name: '/league downtime activities',
          description: 'Browse every downtime activity, its tiers, costs, and whether it needs admin approval — for reference; you don\'t need anything from here to run `start` anymore.',
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
          description: 'View a character\'s quest history, or drill into a specific quest with quest_id for full details and allies.',
        },
        {
          name: '/league leaderboard',
          description: 'View the character leaderboard, sortable by level/gold/reputation/milestones and filterable by class/species/status.',
        },
        {
          name: '/league dashboard',
          description: 'Get a personal button dashboard for quick, one-tap access to your character\'s Profile, Quests, Downtimes, Inventory, Balance, and to switch character, edit details, or set art.',
        },
      ],
    },
    void: {
      label: 'Void',
      description: 'Voluntarily remove an item or gold from your own active character. This is permanent and logged to the league admin channel — use it to self-correct mistakes, not as a way to trade or trigger someone else\'s pending action.',
      commands: [
        {
          name: '/league void item <id>',
          description: 'Destroy an item from your active character\'s inventory. `id` autocompletes to items you own. Cannot be undone.',
        },
        {
          name: '/league void gold <amount>',
          description: 'Remove a specific amount of gold from your active character\'s balance. Cannot be undone.',
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
        '2. Open `/leaguedm dashboard` with that quest ID — everything else happens from there: adding/removing players on the roster, queuing gold/rep/milestone/item rewards as they\'re earned, and completing (or cancelling) the quest once rewards are settled. All of it is submitted for admin approval from the dashboard.',
      commands: [
        {
          name: '/leaguedm quest link <game> [notes]',
          description: 'Link an announced game to the league quest log, creating a quest ID. `game` autocompletes.',
        },
        {
          name: '/leaguedm dashboard <quest_id>',
          description: 'Open the live reward dashboard for a quest — an interactive panel to add/remove players, queue gold/rep/milestone/item rewards for the roster, and submit the quest as complete or cancelled, all before anything is sent for admin approval. `quest_id` autocompletes to your active quests.',
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
        'Every DM-submitted grant (gold, reputation, milestones, items, quest completion) and every player downtime request lands in the pending queue rather than taking effect immediately. Use `pending` to see what\'s waiting, then `approve` or `reject` by action ID to resolve it. Approving finalizes the change (e.g. actually creates the item, or applies the gold); rejecting discards it with no effect.\n\n' +
        '`pending` lists every action awaiting sign-off, including downtime activities: **downtime-start** (magic items, mundane crafting, and spell scrolls always need this) and **downtime-completion** (activities finishing where the blueprint requires post-approval). There is a single approve/reject flow for everything — `/leagueadmin approve id: <id>` and `/leagueadmin reject id: <id> reason: <why>` — no separate downtime command anymore. `reason` is required to reject a downtime-start or downtime-completion action; rejecting a start discards the request outright, rejecting a completion reverts the activity to In Progress (nothing is lost — invested days/gold stay, no output is granted, the player can pick it back up).\n\n' +
        'The `pending` output is grouped into sections so it stays readable as the queue grows: **Currency & Milestone Grants**, **Item Grants**, **Quest Actions**, **Downtime — Start Approval**, **Downtime — Completion Approval** — each with a count in its heading.',
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
        {
          name: '/leagueadmin clear <id>',
          description: '⚠️ Force-remove a stuck pending action without running its approve/reject logic. Only use this if the action already applied and the queue entry is just left over.',
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
        {
          name: '/leagueadmin catalogue sync-spells',
          description: 'Refresh the spell list used by downtime scroll scribing.',
        },
      ],
    },
    audit: {
      label: 'Data Integrity',
      description: 'Requires the Admin role. Read-only checks to catch data problems early.',
      commands: [
        {
          name: '/leagueadmin audit characters',
          description: 'Check for players who have more than one Active character.',
        },
      ],
    },
  },

};
