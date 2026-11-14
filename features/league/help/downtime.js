// /help text of the league downtime commands. ./index.js puts each family into its /help group, in its position.
module.exports = {
  league: {
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
  },
};
