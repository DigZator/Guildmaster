const { EmbedBuilder } = require('discord.js');
const helpData = require('../helpData');

const GROUP_TITLES = {
    help: '📖  Help',
    player: '⚔️  Player Commands',
    admin: '🛡️  Admin Commands',
    league: '🎲  League Commands',
    leaguedm: '🎭  League DM Commands',
    leagueadmin: '⚙️  League Admin Commands',
};

function formatEntry({ name, description }) {
    return `**${name}**\n${description}`;
}

// Discord embed fields cap out at 1024 characters, so a family's command list
// gets split across multiple fields rather than truncated if it runs long.
function chunkedCommandFields(entries) {
    const fields = [];
    let buffer = [];
    let bufferLen = 0;

    const flush = () => {
        if (!buffer.length) return;
        fields.push({ name: '\u200b', value: buffer.join('\n\n') });
        buffer = [];
        bufferLen = 0;
    };

    for (const entry of entries) {
        const text = formatEntry(entry);
        if (bufferLen + text.length + 2 > 1024 && buffer.length) flush();
        buffer.push(text);
        bufferLen += text.length + 2;
    }
    flush();

    return fields;
}

function buildFamilyEmbed(group, family) {
    return new EmbedBuilder()
        .setTitle(`${GROUP_TITLES[group] ?? group}  ·  ${family.label}`)
        .setColor(0xe8c97a)
        .setDescription(family.description)
        .addFields(...chunkedCommandFields(family.commands))
        .setFooter({ text: 'Adventuring Guild Mumbai · Guildmaster' })
        .setTimestamp();
}

module.exports = async (interaction) => {
    const group      = interaction.options.getString('group');
    const familyKey  = interaction.options.getString('family');

    const groupData = helpData[group];
    if (!groupData) {
        return interaction.reply({ content: '❌ Unknown help group.', flags: 64 });
    }

    const familyData = groupData[familyKey];
    if (!familyData) {
        const available = Object.keys(groupData).join(', ');
        return interaction.reply({ content: `❌ Unknown family **${familyKey}** for **${group}**. Available: ${available}`, flags: 64 });
    }

    const embed = buildFamilyEmbed(group, familyData);
    return interaction.reply({ embeds: [embed], flags: 64 });
};
