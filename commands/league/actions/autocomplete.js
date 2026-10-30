const { getCharactersByDiscordId, searchCharactersByName } = require('../../../utils/leagueNotion');

async function characterOwnAutocomplete(interaction) {
	const focused = interaction.options.getFocused().toLowerCase();

	let characters;
	try {
		characters = await getCharactersByDiscordId(interaction.user.id);
	} catch (err) {
		console.error('[league character status] Autocomplete Notion error:', err);
		return interaction.respond([]);
	}

	const choices = characters
		.filter(c => (c.properties['Character Name']?.title?.[0]?.plain_text ?? '').toLowerCase().includes(focused))
		.slice(0, 25)
		.map(c => ({
			name: `${c.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown'} (${c.properties['Status']?.select?.name ?? 'Unknown'})`,
			value: c.id,
		}));

	await interaction.respond(choices);
}

async function characterLogAutocomplete(interaction) {
	const targetUser = interaction.options.getUser('player');
	const focused     = interaction.options.getFocused().toLowerCase();

	const characters = targetUser
		? await getCharactersByDiscordId(targetUser.id)
		: await searchCharactersByName(focused);

	const filtered = targetUser
		? characters.filter(c => (c.properties['Character Name']?.title?.[0]?.plain_text ?? '').toLowerCase().includes(focused))
		: characters;

	const choices = filtered
		.slice(0, 25)
		.map(c => ({
			name: `${c.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown'} (${c.properties['Status']?.select?.name ?? 'Unknown'})`,
			value: c.id,
		}));

	await interaction.respond(choices);
}

module.exports = {
    characterOwnAutocomplete,
    characterLogAutocomplete,
};
