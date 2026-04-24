const { fetchGames } = require('./notion');

async function gameAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const allGames = await fetchGames();

    const filtered = allGames
        .filter(g => g.title.toLowerCase().includes(focusedValue))
        .slice(0, 25)
        .map(g => ({
            name: `${g.title.trim()} (${g.type} | ${g.format})`,
            value: g.uid
        }));

    await interaction.respond(filtered);
}

module.exports = { gameAutocomplete };