const { EmbedBuilder } = require('discord.js');
const helpData = require('../helpData');

function formatEntry({ name, description, options }) {
    const header = `**${name}** — ${description}`;
    if (!options.length) return header;
    const bullets = options.map(o => `  ↳ ${o}`).join('\n');
    return `${header}\n${bullets}`;
}

module.exports = async (interaction) => {
    const playerValue      = helpData.player.map(formatEntry).join('\n\n');
    const adminGameValue   = helpData.admin.slice(0, 3).map(formatEntry).join('\n\n');
    const adminUtilValue   = helpData.admin.slice(3).map(formatEntry).join('\n\n');
    const leagueValue      = helpData.league.map(formatEntry).join('\n\n');
    const leagueDMValue    = helpData.leaguedm.map(formatEntry).join('\n\n');
    const leagueAdminValue = helpData.leagueadmin.map(formatEntry).join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle('📜  Guildmaster Commands')
        .setColor(0xe8c97a)
        .addFields(
            { name: '⚔️  Player Commands',        value: playerValue },
            { name: '🛡️  Admin Commands',          value: adminGameValue },
            { name: '\u200b',                      value: adminUtilValue },
            { name: '🎲  League — Player',         value: leagueValue },
            { name: '🎭  League — DM',             value: leagueDMValue },
            { name: '⚙️  League — Admin',          value: leagueAdminValue },
            { name: '\u200b',                      value: '_DM and Admin commands require the appropriate role._' },
        )
        .setFooter({ text: 'Adventuring Guild Mumbai · Guildmaster' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
};
