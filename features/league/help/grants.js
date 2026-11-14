// /help text of the league admin approvals, rewards, items and audit. ./index.js puts each family into its /help group, in its position.
module.exports = {
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
