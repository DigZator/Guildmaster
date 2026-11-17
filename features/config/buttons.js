// Confirm / cancel buttons for risky /config changes (currently the trap channel).
const { EmbedBuilder } = require('discord.js');
const auth = require('../../shared/auth');
const config = require('./configCommand');
const { EPHEMERAL } = require('../../shared/utilities/ephemeral');

async function handle(interaction, client) {
    const [, action, token] = String(interaction.customId).split(':');
    config.sweepPending();
    const entry = config.pending.get(token);

    if (!entry) {
        return interaction.update({ content: 'That confirmation expired. Run `/config set` again.', embeds: [], components: [] });
    }
    if (interaction.user.id !== entry.userId) {
        return interaction.reply({ content: '❌ Only the person who ran the command can confirm it.', flags: EPHEMERAL });
    }
    if (!auth.can('admin', interaction)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: EPHEMERAL });
    }

    config.pending.delete(token);
    if (action !== 'confirm') {
        return interaction.update({ content: 'Cancelled. Nothing was changed.', embeds: [], components: [] });
    }
    const embed = await config.applySet(client, entry);
    return interaction.update({ content: '', embeds: [embed instanceof EmbedBuilder ? embed : new EmbedBuilder().setDescription('Saved.')], components: [] });
}

module.exports = { prefix: { 'config:': handle } };
