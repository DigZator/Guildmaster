// The slash command definitions of the shop and marketplace groups of /league and the shop group of /leagueadmin. Each export is the callback one subcommand (or group) is built from;
// ./index.js adds them in the order they are registered.

//shop
const shopGroup = group => group
		    .setName('shop')
		    .setDescription('Guild shop')
		    .addSubcommand(sub => sub
	            .setName('browse')
	            .setDescription('Browse shop with filters')
	            .addStringOption(opt => opt.setName('rarity').setDescription('Filter by rarity').setRequired(false)
	                .addChoices(
	                    { name: 'Common',    value: 'Common' },
	                    { name: 'Uncommon',  value: 'Uncommon' },
	                    { name: 'Rare',      value: 'Rare' },
	                    { name: 'Very Rare', value: 'Very Rare' },
	                    { name: 'Legendary', value: 'Legendary' },
	                ))
	            .addStringOption(opt => opt.setName('sort').setDescription('Sort by').setRequired(false)
	                .addChoices(
	                    { name: 'Price (Low to High)', value: 'price_asc' },
	                    { name: 'Price (High to Low)', value: 'price_desc' },
	                    { name: 'Name', value: 'name' },
	                )))
		    .addSubcommand(sub => sub
		        .setName('buy')
		        .setDescription('Buy an item from the shop')
		        .addStringOption(opt => opt
		        	.setName('id')
		        	.setDescription('Shop item ID')
		        	.setRequired(true)
		        	.setAutocomplete(true)))
	        .addSubcommand(sub => sub
	            .setName('sell')
	            .setDescription('Sell item(s) from your inventory to the shop for half value')
	            .addStringOption(opt => opt
	                .setName('item')
	                .setDescription('Pick a single item from your inventory')
	                .setRequired(false)
	                .setAutocomplete(true))
	            .addStringOption(opt => opt
	                .setName('item_id')
	                .setDescription('[Legacy] Positional #s for multiple items, e.g. 001,003 (may fail if inventory changed)')
	                .setRequired(false)))
		    .addSubcommand(sub => sub
		        .setName('search')
		        .setDescription('Search the full item catalogue by name')
		        .addStringOption(opt => opt
		        	.setName('name')
		        	.setDescription('Item name to search for')
		        	.setRequired(true)))
		    .addSubcommand(sub => sub
		        .setName('info')
		        .setDescription('View full details of an item by its code')
		        .addStringOption(opt => opt
		        	.setName('code')
		        	.setDescription('Item code (from search/browse)')
		        	.setRequired(true)
		        	.setAutocomplete(true)));

//marketplace
const marketplaceGroup = group => group
		    .setName('marketplace')
		    .setDescription('Player marketplace')
		    .addSubcommand(sub => sub
		        .setName('browse')
		        .setDescription('Browse marketplace with filters')
		        .addStringOption(opt => opt.setName('rarity').setDescription('Filter by rarity').setRequired(false)
		            .addChoices(
		                { name: 'Common',    value: 'Common' },
		                { name: 'Uncommon',  value: 'Uncommon' },
		                { name: 'Rare',      value: 'Rare' },
		                { name: 'Very Rare', value: 'Very Rare' },
		                { name: 'Legendary', value: 'Legendary' },
		            ))
		        .addStringOption(opt => opt.setName('sort').setDescription('Sort by').setRequired(false)
		            .addChoices(
		                { name: 'Price',  value: 'Asking Price' },
		                { name: 'Newest', value: 'Listed Date' },
		            )))
		    .addSubcommand(sub => sub
		        .setName('buy')
		        .setDescription('Buy a marketplace listing')
		        .addStringOption(opt => opt.setName('id').setDescription('Listing ID').setRequired(true)))
		    .addSubcommand(sub => sub
		        .setName('list')
		        .setDescription('List an item on the marketplace')
		        .addStringOption(opt => opt.setName('item_id').setDescription('Pick an item from your inventory').setRequired(true).setAutocomplete(true))
		        .addIntegerOption(opt => opt.setName('price').setDescription('Asking price in gp').setRequired(true).setMinValue(1)))
		    .addSubcommand(sub => sub
		        .setName('unlist')
		        .setDescription('Remove your marketplace listing')
		        .addStringOption(opt => opt.setName('id').setDescription('Listing ID to remove').setRequired(true)));

//shop
const adminShopGroup = group => group
			.setName('shop')
			.setDescription('Guild shop management')
			.addSubcommand(sub => sub
				.setName('stock')
				.setDescription('Add/update an item on the shop floor from the catalogue')
				.addStringOption(opt => opt.setName('code').setDescription('Catalogue item code').setRequired(true).setAutocomplete(true))
				.addIntegerOption(opt => opt.setName('quantity').setDescription('Quantity to stock').setRequired(true).setMinValue(0))
				.addIntegerOption(opt => opt.setName('price').setDescription('Override price in gp (defaults to official SRD price)').setRequired(false).setMinValue(0)))
			.addSubcommand(sub => sub
			    .setName('stockall')
			    .setDescription('Bulk-stock the whole catalogue (or one rarity) at rarity-default quantities')
			    .addStringOption(opt => opt.setName('rarity').setDescription('Limit to one rarity').setRequired(false)
			        .addChoices(
			            { name: 'Common',    value: 'Common' },
			            { name: 'Uncommon',  value: 'Uncommon' },
			            { name: 'Rare',      value: 'Rare' },
			            { name: 'Very Rare', value: 'Very Rare' },
			            { name: 'Legendary', value: 'Legendary' },
			        )))
	        .addSubcommand(sub => sub
				.setName('unstock')
				.setDescription('Remove an item from the shop floor')
				.addStringOption(opt => opt.setName('code').setDescription('Shop item ID').setRequired(true).setAutocomplete(true)))
			.addSubcommand(sub => sub
				.setName('restock')
				.setDescription('Manually trigger a restock for an item')
				.addStringOption(opt => opt.setName('code').setDescription('Shop item ID').setRequired(true).setAutocomplete(true)));

module.exports = { shopGroup, marketplaceGroup, adminShopGroup };
