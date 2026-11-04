const { route, routes } = require('../core/manifest');
const create_campaign = require('../commands/create_campaign');
const announce_game = require('../commands/announce_game');
const list_games = require('../commands/list_games');
const edit_game = require('../commands/edit_game');
const get_players = require('../commands/get_players');
const manipulate_table = require('../commands/manipulate_table');
const archive = require('../commands/archive');
const archiveConfig = require('../commands/archiveConfig');
const announcement = require('../buttons/announcement');
const listGames = require('../buttons/listGames');
const editGameCheckbox = require('../buttons/editGameCheckbox');
const archiveButtons = require('../buttons/archive');
const tableAdmin = require('../buttons/tableAdmin');
const createCampaign = require('../buttons/createCampaign');
const { gameAutocomplete } = require('../utils/gameAutoComplete');
const gameFields = require('../data/gameFields.json');

// Autocomplete is not permission-checked today (see POST_REFACTOR.md, issue 1), so every entry is 'open'.
const gamePicker = [{ name: 'games', policy: 'open', handle: gameAutocomplete }];

async function editGameAutocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'game') {
        await gameAutocomplete(interaction);
        return;
    }

    if (focused.name === 'field') {
        const query = focused.value.toLowerCase();
        const choices = Object.keys(gameFields)
            .filter(f => f.toLowerCase().includes(query))
            .slice(0, 25)
            .map(f => ({ name: f, value: f }));
        await interaction.respond(choices);
    }
}

const admin = (name, handler, autocomplete) => ({ name, policy: 'open', gate: 'admin', handler, ...(autocomplete && { autocomplete }) });

module.exports = {
    name: 'games',
    commands: [
        admin('create_campaign', create_campaign),
        admin('announce_game', announce_game, gamePicker),
        // No refusal: the handler shows unreleased games to the bot_legacy view only.
        { name: 'list_games', policy: 'open', gate: 'bot_legacy', handler: list_games },
        admin('edit_game', edit_game, [{ name: 'game / field', policy: 'open', handle: editGameAutocomplete }]),
        admin('get_players', get_players, gamePicker),
        admin('manipulate_table', manipulate_table, gamePicker),
        admin('archive', archive),
        admin('archive-config', archiveConfig),
    ],
    buttons: {
        // These buttons check nothing themselves today; the messages that carry them are ephemeral replies
        // to admin-gated commands (see POST_REFACTOR.md).
        exact: {
            ...routes('open', announcement.exact),
            ...routes('open', archiveButtons.exact),
            ...routes('open', createCampaign.exact),
        },
        prefix: {
            ...routes('open', listGames.prefix),
            ...routes('open', editGameCheckbox.prefix),
            ...routes('open', archiveButtons.prefix),
            ...routes('open', tableAdmin.prefix),
        },
    },
    modals: {
        prefix: {
            'editgame_modal_': route('open', (i, c) => require('../modals/editGameModal')(i, c)),
            'announceedit_modal_': route('open', (i, c) => require('../modals/announceEditModal')(i, c)),
            'tableAdminAddPlayerModal:': route('open', (i) => require('../modals/tableAdminAddPlayerModal')(i)),
            'tableAdminNumberModal:': route('open', (i) => require('../modals/tableAdminNumberModal')(i)),
        },
    },
    selects: {
        exact: { announce_edit_select: route('open', (i, c) => require('../selects/announceEditSelect')(i, c)) },
        prefix: { 'tableAdminSeatSelect:': route('open', (i) => require('../selects/tableAdminSeatSelect').handle(i)) },
    },
};
