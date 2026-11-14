// /help text of the league void commands. ./index.js puts each family into its /help group, in its position.
module.exports = {
  league: {
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
};
