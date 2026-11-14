// /help text of the league quest commands (player and DM). ./index.js puts each family into its /help group, in its position.
module.exports = {
  league: {
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
};
