const { route, routes } = require('../core/manifest');
const { league, characterLogAutocomplete, characterOwnAutocomplete } = require('../commands/league');
const { backgroundAutocomplete } = require('../features/league/starterItems/command');
const { questLinkAutocomplete, dashboardQuestAutocomplete } = require('../commands/leagueQuest');
const { catalogueAutocomplete } = require('../utils/catalogueAutoComplete');
const { getItemAutocompleteChoices } = require('../utils/inventoryHelper');
const { spellAutocomplete } = require('../utils/spellAutoComplete');
const { magicItemAutocomplete } = require('../utils/magicItemAutoComplete');
const { downtimeActivityAutocomplete, downtimeTierAutocomplete } = require('../utils/downtimeAutoComplete');
const { leagueAdmin, leagueDM } = require('../commands/leagueGrants');
const inventory = require('../buttons/inventory');
const shopSearch = require('../buttons/shopSearch');
const shopBrowse = require('../buttons/shopBrowse');
const shopDiscount = require('../buttons/shopDiscount');
const shopSell = require('../buttons/shopSell');
const downtimeBuyDays = require('../buttons/downtimeBuyDays');
const starterItems = require('../features/league/starterItems/buttons');
const leaderboard = require('../buttons/leaderboard');
const characterStatus = require('../buttons/characterStatus');
const questDashboard = require('../buttons/questDashboard');
const leagueDashboard = require('../buttons/leagueDashboard');

const CODE_AUTOCOMPLETE_TARGETS = new Set([
    'league:shop:info',
    'league:shop:buy',
    'leagueadmin:shop:stock',
    'leagueadmin:shop:unstock',
    'leagueadmin:shop:restock',
    'leagueadmin:item:import',
]);

const ITEM_AUTOCOMPLETE_TARGETS = new Set([
    'league:void:item',
    'league:marketplace:list',
    'league:shop:sell',
    'league:item',
]);

// One shared block for /league, /leagueadmin and /leaguedm, moved over unchanged from the old command router:
// the order of the checks, the fall-through when an inner check misses, and the lookup keys all matter.
// Autocomplete is not permission-checked today (see POST_REFACTOR.md, issue 1), so the entries are 'open'.
async function leagueAutocomplete(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);

    // Starter-items background autocomplete
    if (interaction.commandName === 'league' && sub === 'starter-items') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'background') {
            await backgroundAutocomplete(interaction);
            return;
        }
    }

    // Quest link autocomplete
    if (interaction.commandName === 'leaguedm' && group === 'quest' && sub === 'link') {
        await questLinkAutocomplete(interaction);
        return;
    }

    // Dashboard quest_id autocomplete: active quests only
    if (interaction.commandName === 'leaguedm' && sub === 'dashboard') {
        await dashboardQuestAutocomplete(interaction);
        return;
    }

    // Downtime start: activity, then tier (depends on activity), then spell / item
    if (interaction.commandName === 'league' && group === 'downtime' && sub === 'start') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'activity') {
            await downtimeActivityAutocomplete(interaction);
            return;
        }
        if (focused.name === 'tier') {
            await downtimeTierAutocomplete(interaction);
            return;
        }
        if (focused.name === 'spell') {
            await spellAutocomplete(interaction);
            return;
        }
        if (focused.name === 'item') {
            await magicItemAutocomplete(interaction);
            return;
        }
    }

    // Character autocomplete (league log)
    if (interaction.commandName === 'league' && sub === 'log') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'character') {
            await characterLogAutocomplete(interaction);
            return;
        }
    }

    // Character autocomplete (league character status): own characters only
    if (interaction.commandName === 'league' && group === 'character' && sub === 'status') {
        const focused = interaction.options.getFocused(true);
        if (focused.name === 'character') {
            await characterOwnAutocomplete(interaction);
            return;
        }
    }

    const key = group ? `${interaction.commandName}:${group}:${sub}` : `${interaction.commandName}:${sub}`;
    if (CODE_AUTOCOMPLETE_TARGETS.has(key)) {
        await catalogueAutocomplete(interaction);
        return;
    }

    if (ITEM_AUTOCOMPLETE_TARGETS.has(key)) {
        const choices = await getItemAutocompleteChoices(interaction);
        await interaction.respond(choices);
    }
}

const LEAGUE_ADMIN_DENIED = '❌ You must be an admin or use this in the league admin channel.';
const leagueAutocompleteEntries = [{ name: 'league / leagueadmin / leaguedm', policy: 'open', handle: leagueAutocomplete }];

module.exports = {
    name: 'league',
    commands: [
        // Player commands: no role check today (several check for an active character inside the handler).
        { name: 'league', policy: 'open', handler: league, autocomplete: leagueAutocompleteEntries },
        // Everything under /leagueadmin, enforced by the router: admin role OR the league-admin / control channel
        // (the old quirk, kept on purpose). Every subcommand used to check this at the top of its handler.
        { name: 'leagueadmin', policy: 'league_legacy', denied: LEAGUE_ADMIN_DENIED, handler: leagueAdmin, autocomplete: leagueAutocompleteEntries },
        { name: 'leaguedm', policy: 'open', gate: 'own: DM role', handler: leagueDM, autocomplete: leagueAutocompleteEntries },
    ],
    buttons: {
        exact: {
            ...routes('open', shopDiscount.exact),
            ...routes('open', shopSell.exact),
            ...routes('open', downtimeBuyDays.exact),
            ...routes('open', starterItems.exact),
            ...routes('open', leagueDashboard.exact),
        },
        prefix: {
            ...routes('open', inventory.prefix),
            ...routes('open', shopSearch.prefix),
            ...routes('open', shopBrowse.prefix),
            ...routes('open', starterItems.prefix),
            ...routes('open', leaderboard.prefix),
            ...routes('open', characterStatus.prefix),
            ...routes('open', questDashboard.prefix),
        },
    },
    modals: {
        exact: { leagueCreate: route('open', (i, c) => require('../interactions/leagueCreateModal').handleLeagueCreate(i, c)) },
        prefix: {
            'leagueDashEditModal:': route('open', (i) => require('../modals/leagueDashEdit')(i)),
            'questDash:': route('open', (i) => require('../buttons/questDashboard').handleDashboardModal(i)),
        },
    },
    selects: {
        exact: {
            shopbuy_discount_select: route('open', (i) => require('../selects/shopDiscountSelect')(i)),
            starter_items_select: route('open', (i) => require('../features/league/starterItems/select')(i)),
            leagueDashSwitchSelect: route('open', (i) => require('../selects/leagueDashSwitchSelect')(i)),
        },
        prefix: { 'questDash:': route('open', (i) => require('../buttons/questDashboard').handleDashboardSelect(i)) },
    },
    userSelects: {
        prefix: { 'questDash:': route('open', (i) => require('../buttons/questDashboard').handleDashboardUserSelect(i)) },
    },
};
