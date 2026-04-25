function isAdminChannel(interaction) {
    const allowed = ['test-in', 'guildmaster-ctrl'];
    return allowed.includes(interaction.channel.name);
}

module.exports = { isAdminChannel };