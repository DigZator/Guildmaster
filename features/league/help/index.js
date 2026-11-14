// The /help families of the league feature, in the order /help lists them. Each line names the area file that holds the text.
const character = require('./character');
const downtime = require('./downtime');
const economy = require('./economy');
const grants = require('./grants');
const inventory = require('./inventory');
const quests = require('./quests');
const shop = require('./shop');
const voidCommand = require('./void');

module.exports = {
  league: {
    character: character.league.character,
    inventory: inventory.league.inventory,
    shop: shop.league.shop,
    marketplace: shop.league.marketplace,
    downtime: downtime.league.downtime,
    economy: economy.league.economy,
    quest: quests.league.quest,
    void: voidCommand.league.void,
  },
  leaguedm: {
    'quest-management': quests.leaguedm['quest-management'],
  },
  leagueadmin: {
    approvals: grants.leagueadmin.approvals,
    rewards: grants.leagueadmin.rewards,
    items: grants.leagueadmin.items,
    'shop-catalogue': shop.leagueadmin['shop-catalogue'],
    audit: grants.leagueadmin.audit,
  },
};
