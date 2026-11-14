const { REST, Routes } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    throw new Error('Missing environment variables');
}

const commands = [
	//ping: defined by the general feature
	require('./features/general').definitions.ping,

	//keep_alive: defined by the general feature
	require('./features/general').definitions.keep_alive,

	//create_campaign: defined by the games feature
	require('./features/games').definitions.create_campaign,

	//the_long_rest: defined by the long-rest feature
	...require('./features/theLongRest').definitions,

	//announce_game: defined by the games feature
	require('./features/games').definitions.announce_game,

	//ticket: defined by the tickets feature
	...require('./features/tickets').definitions,

	//direct_line: defined by the direct-line feature
	...require('./features/directLine').definitions,

	//list_games: defined by the games feature
	require('./features/games').definitions.list_games,

	//get_players: defined by the games feature
	require('./features/games').definitions.get_players,

	//manipulate_table: defined by the games feature
	require('./features/games').definitions.manipulate_table,
	        
	//game_info: defined by the games feature
	require('./features/games').definitions.game_info,

	//rss and anon_msg: defined by the messaging feature
	...require('./features/messaging').definitions,

	//schedule_activation: defined by the games feature
	require('./features/games').definitions.schedule_activation,
	//help: defined by the general feature
	require('./features/general').definitions.help,

	//edit_game: defined by the games feature
	require('./features/games').definitions.edit_game,

	//league, leagueadmin and leaguedm: defined by the league feature
	...require('./features/league').definitions,

	//archive and archive-config: defined by the archive feature
	...require('./features/archive').definitions,

	//config: defined by the config feature
	...require('./features/config').definitions,

	//channel_file: defined by the channel-file feature
	...require('./features/channelFile').definitions,

	//verification: defined by the verification feature
	...require('./features/verification').definitions,
].map(cmd => cmd.toJSON());

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
