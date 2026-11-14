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
    // game-management and scheduling: help text of the games feature
    ...require('./features/games').help.admin,
    // rss and messaging: help text of the messaging feature
    ...require('./features/messaging').help.admin,
    // tickets: help text of the tickets feature
    ...require('./features/tickets').help.admin,
    // archive: help text of the archive feature
    ...require('./features/archive').help.admin,
    // config: help text of the config feature
    ...require('./features/config').help.admin,
    // channel-file: help text of the channel-file feature
    ...require('./features/channelFile').help.admin,
  },

  // ─── /help league <family> ──────────────────────────────────────────────
  league: require('./features/league').help.league,

  // ─── /help leaguedm <family> ─────────────────────────────────────────────
  leaguedm: require('./features/league').help.leaguedm,

  // ─── /help leagueadmin <family> ──────────────────────────────────────────
  leagueadmin: require('./features/league').help.leagueadmin,

};
