const { REST, Routes } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    throw new Error('Missing environment variables');
}

// Each feature owns its command definitions (features/<name>/definitions). This file only decides the order they are
// registered in. The order interleaves features (general's /ping and /keep_alive are not side by side), and the command
// snapshot pins it, so it is written out here: [feature, command] is one command of a feature that has several, and
// [feature] is all of the feature's commands.
const features = {
    general: require('./features/general'),
    games: require('./features/games'),
    theLongRest: require('./features/theLongRest'),
    tickets: require('./features/tickets'),
    directLine: require('./features/directLine'),
    messaging: require('./features/messaging'),
    league: require('./features/league'),
    archive: require('./features/archive'),
    config: require('./features/config'),
    channelFile: require('./features/channelFile'),
    verification: require('./features/verification'),
};

const REGISTRATION_ORDER = [
    ['general', 'ping'],
    ['general', 'keep_alive'],
    ['games', 'create_campaign'],
    ['theLongRest'],
    ['games', 'announce_game'],
    ['tickets'],
    ['directLine'],
    ['games', 'list_games'],
    ['games', 'get_players'],
    ['games', 'manipulate_table'],
    ['games', 'game_info'],
    ['messaging'],
    ['games', 'schedule_activation'],
    ['general', 'help'],
    ['games', 'edit_game'],
    ['league'],
    ['archive'],
    ['config'],
    ['channelFile'],
    ['verification'],
];

const commands = REGISTRATION_ORDER.flatMap(([feature, name]) => {
    const { definitions } = features[feature];
    if (!name) return [...definitions];
    if (!definitions[name]) throw new Error(`Feature "${feature}" has no command definition "${name}"`);
    return [definitions[name]];
}).map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Refreshing application (/) commands...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log('Commands successfully registered.');
    } catch (error) {
        console.error('Failed to register commands:', JSON.stringify(error?.rawError ?? error, null, 2));
    }
})();
