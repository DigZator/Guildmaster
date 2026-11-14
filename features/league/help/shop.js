// /help text of the league shop, marketplace and shop catalogue. ./index.js puts each family into its /help group, in its position.
module.exports = {
  league: {
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
  },
  leagueadmin: {
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
  },
};
