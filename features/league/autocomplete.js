const { catalogueAutocomplete } = require('../../utils/catalogueAutoComplete');
const { getItemAutocompleteChoices } = require('./inventory/helper');
const starterItems = require('./routes/starterItems');
const quests = require('./routes/quests');
const downtime = require('./routes/downtime');
const character = require('./routes/character');
const shop = require('./routes/shop');
const grants = require('./routes/grants');
const inventory = require('./routes/inventory');
const voidCommand = require('./routes/void');

// The autocomplete keys (command:group:subcommand) that answer with the catalogue codes, and those that answer with the
// player's own items. Each area names its own keys in its routes file.
const CODE_AUTOCOMPLETE_TARGETS = new Set([...shop.codeTargets, ...grants.codeTargets]);

const ITEM_AUTOCOMPLETE_TARGETS = new Set([...voidCommand.itemTargets, ...shop.itemTargets, ...inventory.itemTargets]);

// The areas that answer an autocomplete of their own, in the order they are asked. Each returns true when it answered.
const AREA_AUTOCOMPLETE = [starterItems.autocomplete, quests.autocomplete, downtime.autocomplete, character.autocomplete];

// One shared block for /league, /leagueadmin and /leaguedm, moved over unchanged from the old command router:
// the order of the checks, the fall-through when an inner check misses, and the lookup keys all matter.
// Autocomplete is not permission-checked today (see POST_REFACTOR.md, issue 1), so the entries are 'open'.
async function leagueAutocomplete(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);

    for (const answer of AREA_AUTOCOMPLETE) {
        if (await answer(interaction, group, sub)) return;
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

module.exports = { leagueAutocomplete };
