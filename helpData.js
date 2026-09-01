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
          description: 'General server-admin tooling — game announcements, the activation schedule, RSS feeds, anonymous messaging, and support tickets. Families: game-management, scheduling, rss, messaging, tickets.',
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
          description: 'Edit a field on a game in Notion. Both `game` and `field` autocomplete — includes Registration Link and Registration Line. Text/number/date fields open a form; checkbox fields (e.g. Activate) show True/False buttons instead.',
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
    tickets: {
      label: 'Support Tickets',
      description: 'Set up and manage the ticket dashboard. Requires the Admin role.',
      commands: [
        {
          name: '/ticket setup',
          description: 'Post the ticket dashboard in the current channel (or refresh it in place if one was already posted).',
        },
        {
          name: '/ticket config [category] [hr_category] [log_channel] [hr_log_channel]',
          description: 'View or update where ticket channels are created and logged. Run with no options to see the current config.',
        },
        {
          name: '/ticket reset_counter [type]',
          description: 'Reset a ticket type\'s numbering back to `000`. Omit `type` to reset all counters. `type` autocompletes.',
        },
        {
          name: '/ticket type add <label> [key] [slug] [emoji] [channel_tag] [modal_title] [category_group] [viewer_role] [ping_target_role]',
          description: 'Add a new ticket type — it appears on the dashboard immediately (the posted dashboard is refreshed automatically). `key`/`slug` default to a slugified version of `label` if omitted. `category_group` is `normal` or `hr` and controls which category/log channel (set via `/ticket config`) the type\'s tickets use.',
        },
        {
          name: '/ticket type edit <key> [label] [slug] [emoji] [channel_tag] [modal_title] [category_group] [viewer_role] [ping_target_role]',
          description: 'Edit an existing ticket type. `key` autocompletes. Only the fields you provide are changed; the dashboard is refreshed automatically.',
        },
        {
          name: '/ticket type remove <key>',
          description: 'Remove a ticket type. `key` autocompletes. Existing tickets already raised under this type are unaffected; it just disappears from the dashboard and can no longer be selected for new tickets.',
        },
        {
          name: '/ticket type list',
          description: 'List all configured ticket types and their settings.',
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
        '3. While the quest runs, grant rewards as they\'re earned via `/leaguedm gold`, `rep`, `milestone`, or `item create`/`item import` — each goes to admins for approval. `/leaguedm dashboard` covers all of this from one interactive panel, including editing the roster, if you\'d rather not use the individual commands.\n' +
        '4. Only once rewards are settled, **complete** the quest — this is logged for admins and still requires approval before it\'s finalized. This can also be done from the dashboard.\n' +
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
          name: '/leaguedm quest players <quest_id>',
          description: 'View the roster for a quest — Discord player, character name, class, species, and level.',
        },
        {
          name: '/leaguedm quest complete <quest_id> <milestones> <reputation>',
          description: 'Mark a quest as completed, logging the total milestones/reputation given out this quest for admin review. Do this last, after rewards are granted — this only logs the totals, it does not distribute them; use gold/rep/milestone/item for that.',
        },
        {
          name: '/leaguedm dashboard <quest_id>',
          description: 'Open the live reward dashboard for a quest — an interactive panel to queue gold/rep/milestone/item rewards for the roster, edit the party, and submit the quest as complete or cancelled, all before anything is sent for admin approval. `quest_id` autocompletes to your active quests.',
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
