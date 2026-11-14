// /help text of the league inventory commands. ./index.js puts each family into its /help group, in its position.
module.exports = {
  league: {
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
  },
};
