// Confirm / cancel buttons for risky /config changes (currently the trap channel).
const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../utils/isAdminChannel');
const config = require('../utils/configCommand');

async function handle(interaction, client) {
    const [, action, token] = String(interaction.customId).split(':');
    config.sweepPending();
    const entry = config.pending.get(token);

    if (!entry) {
        return interaction.update({ content: 'That confirmation expired. Run `/config set` again.', embeds: [], components: [] });
    }
    if (interaction.user.id !== entry.userId) {
        return interaction.reply({ content: '❌ Only the person who ran the command can confirm it.', flags: 64 });
    }
    if (!isAdminChannel(interaction, 'botAdmin')) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    config.pending.delete(token);
    if (action !== 'confirm') {
        return interaction.update({ content: 'Cancelled. Nothing was changed.', embeds: [], components: [] });
    }
    const embed = await config.applySet(client, entry);
    return interaction.update({ content: '', embeds: [embed instanceof EmbedBuilder ? embed : new EmbedBuilder().setDescription('Saved.')], components: [] });
}

module.exports = { prefix: { 'config:': handle } };
