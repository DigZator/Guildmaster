// /help text of the league gold, balance and leaderboard. ./index.js puts each family into its /help group, in its position.
module.exports = {
  league: {
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
  },
};
