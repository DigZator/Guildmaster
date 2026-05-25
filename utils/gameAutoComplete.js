// const { fetchGames } = require('./notion');
const { getCachedGames } = require('./cache');

async function gameAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    // const allGames = await fetchGames();
    const allGames = await getCachedGames();

    const filtered = allGames
	.sort((a,b) => b.createdTime - a.createdTime)
        .filter(g => g.title.toLowerCase().includes(focusedValue))
        .slice(0, 25)
        .map(g => ({
            name: `${g.title.trim()} (${g.type} | ${g.format})`,
            value: g.uid
        }));

    await interaction.respond(filtered);
}

module.exports = { gameAutocomplete };
