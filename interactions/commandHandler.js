const { gameAutocomplete } = require('../utils/gameAutoComplete');
const { getKeys } = require('../utils/anonStore');
const { getCachedGames } = require('../utils/cache');
const { getQueue } = require('../utils/activationQueue');
const gameFields = require('../data/gameFields.json');
const ping = require('../commands/ping');
const the_long_rest = require('../commands/the_long_rest');
const announce_game = require('../commands/announce_game');
const list_games = require('../commands/list_games');
const game_info = require('../commands/game_info');
const rss = require('../commands/rss');
const anon_msg = require('../commands/anon_msg');
const schedule_activation = require('../commands/schedule_activation');
const help = require('../commands/help');
const edit_game = require('../commands/edit_game');
const { league, characterLogAutocomplete, characterOwnAutocomplete } = require('../commands/league');
const { backgroundAutocomplete } = require('../commands/leagueStarterItems');
const { leagueAdmin, leagueDM } = require('../commands/leagueGrants');
const { questLinkAutocomplete, dashboardQuestAutocomplete } = require('../commands/leagueQuest');
const helpData = require('../helpData');
const { catalogueAutocomplete } = require('../utils/catalogueAutoComplete');
const { getItemAutocompleteChoices } = require('../utils/inventoryHelper');
const { spellAutocomplete } = require('../utils/spellAutoComplete');
const { magicItemAutocomplete } = require('../utils/magicItemAutoComplete');
const { downtimeActivityAutocomplete, downtimeTierAutocomplete } = require('../utils/downtimeAutoComplete');
const get_players = require('../commands/get_players');

const CODE_AUTOCOMPLETE_TARGETS = new Set([
    'league:shop:info',
    'league:shop:buy',
    'leagueadmin:shop:stock',
    'leagueadmin:shop:unstock',
    'leagueadmin:shop:restock',
    'leagueadmin:item:import',
    'leaguedm:item:import',
]);

const ITEM_AUTOCOMPLETE_TARGETS = new Set([
    'league:void:item',
    'league:marketplace:list',
    'league:shop:sell',
    'league:item',
]);

module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {

        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'game_info' || interaction.commandName === 'announce_game' || interaction.commandName === 'get_players') {
                await gameAutocomplete(interaction);
                return;
            }

            if (interaction.commandName === 'anon_msg') {
                const focused = interaction.options.getFocused().toLowerCase();
                const choices = getKeys()
                    .filter(k => k.toLowerCase().includes(focused))
                    .slice(0, 25)
                    .map(k => ({ name: k, value: k }));
                await interaction.respond(choices);
                return;
            }

            if (interaction.commandName === 'schedule_activation') {
                const sub = interaction.options.getSubcommand();
                const focused = interaction.options.getFocused().toLowerCase();
                const games = await getCachedGames();

                if (sub === 'add') {
                    const filtered = games
                        .filter(g => !g.activate && g.title.toLowerCase().includes(focused))
                        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
                        .slice(0, 25)
                        .map(g => ({ name: `${g.title.trim()} (${g.date})`, value: g.uid }));
                    await interaction.respond(filtered);
                    return;
                }

                if (sub === 'remove') {
                    const queue = getQueue().queue;
                    const filtered = queue
                        .filter(g => g.title.toLowerCase().includes(focused))
                        .slice(0, 25)
                        .map(g => ({ name: g.title, value: g.uid }));
                    await interaction.respond(filtered);
                    return;
                }
            }

            if (interaction.commandName === 'edit_game') {
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
                    return;
                }
            }

            if (interaction.commandName === 'help') {
                const focused = interaction.options.getFocused(true);

                if (focused.name === 'family') {
                    const group = interaction.options.getString('group');
                    const groupData = helpData[group];
                    const query = focused.value.toLowerCase();

                    const choices = groupData
                        ? Object.entries(groupData)
                            .filter(([key, fam]) => key.toLowerCase().includes(query) || fam.label.toLowerCase().includes(query))
                            .slice(0, 25)
                            .map(([key, fam]) => ({ name: fam.label, value: key }))
                        : [{ name: 'Pick a group first', value: 'none' }];

                    await interaction.respond(choices);
                    return;
                }
            }

            // ─── league / leagueadmin / leaguedm ─────────────────────────────
            if (
                interaction.commandName === 'league' ||
                interaction.commandName === 'leagueadmin' ||
                interaction.commandName === 'leaguedm'
            ) {
                const group = interaction.options.getSubcommandGroup(false);
                const sub   = interaction.options.getSubcommand(false);

                // Starter-items background autocomplete
                if (interaction.commandName === 'league' && sub === 'starter-items') {
                    const focused = interaction.options.getFocused(true);
                    if (focused.name === 'background') {
                        await backgroundAutocomplete(interaction);
                        return;
                    }
                }

                // Quest link autocomplete (leaguedm quest link) — distinct UID system, not a catalogue code
                if (interaction.commandName === 'leaguedm' && group === 'quest' && sub === 'link') {
                    await questLinkAutocomplete(interaction);
                    return;
                }

                // Dashboard quest_id autocomplete (leaguedm dashboard) — Active quests only
                if (interaction.commandName === 'leaguedm' && sub === 'dashboard') {
                    await dashboardQuestAutocomplete(interaction);
                    return;
                }

                // Downtime start: activity → tier (dependent) → spell/item
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

                // Character autocomplete (league character status) — own characters only
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
                    return;
                }
            }

            return;
        }

        if (!interaction.isChatInputCommand()) return;
        if (!interaction.guild) return;

        const command = interaction.commandName;

        try {
            if (command === 'ping') await ping(interaction);
            if (command === 'the_long_rest') await the_long_rest(interaction, client);
            if (command === 'announce_game') await announce_game(interaction, client);
            if (command === 'list_games') await list_games(interaction, client);
            if (command === 'game_info') await game_info(interaction, client);
            if (command === 'rss') await rss(interaction, client);
            if (command === 'anon_msg') await anon_msg(interaction, client);
            if (command === 'schedule_activation') await schedule_activation(interaction, client);
            if (command === 'help') await help(interaction);
            if (command === 'edit_game') await edit_game(interaction, client);
            if (command === 'league') await league(interaction, client);
            if (command === 'leagueadmin') await leagueAdmin(interaction, client);
            if (command === 'leaguedm') await leagueDM(interaction, client);
            if (command === 'get_players') await get_players(interaction, client);
        } catch (error) {
            console.error('Error handling interaction:', error);

            if (error.code === 10062) {
                console.warn(`[commandHandler] Interaction expired before we could respond: ${command}`);
                return;
            }

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'There was an error while executing this command!',
                        flags: 64
                    });
                } else {
                    await interaction.followUp({
                        content: 'There was an error while executing this command!',
                        flags: 64
                    });
                }
            } catch (replyError) {
                console.warn('[commandHandler] Fallback reply also failed:', replyError.message);
            }
        }
    });
};
