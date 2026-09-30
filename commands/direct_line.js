const { isAdminChannel } = require('../utils/isAdminChannel');
const directLineStore = require('../utils/directLineStore');
const directLineFlow = require('../flow/directLineFlow');

function denyMessage() {
    return { content: '❌ Only HR can use this command.', flags: 64 };
}

function collectTargets(interaction) {
    const users = ['target', 'target2', 'target3', 'target4']
        .map(name => interaction.options.getUser(name))
        .filter(Boolean);

    const seen = new Set();
    const deduped = [];
    for (const user of users) {
        if (seen.has(user.id)) continue;
        seen.add(user.id);
        deduped.push(user);
    }
    return deduped;
}

function findOpenDirectLine(interaction) {
    const channel = interaction.channel;
    if (!directLineFlow.isDirectLineChannel(channel)) return { error: '❌ This can only be used inside a direct line channel (one whose name starts with `dc-`).' };
    const record = directLineStore.getDirectLineByChannelId(channel.id);
    if (!record || record.status !== 'open') return { error: '❌ No open direct line record found for this channel.' };
    return { record };
}

async function handleCreate(interaction) {
    const targets = collectTargets(interaction);

    if (!targets.length) {
        return interaction.reply({ content: '❌ You must provide at least one target.', flags: 64 });
    }
    if (targets.some(u => u.bot)) {
        return interaction.reply({ content: '❌ You can\'t target a bot.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });
    await directLineFlow.createDirectLine(interaction, targets);
}

async function handleAttach(interaction) {
    const targets = collectTargets(interaction);
    const remove = interaction.options.getBoolean('remove', true);

    if (!targets.length) {
        return interaction.reply({ content: '❌ You must provide at least one target.', flags: 64 });
    }
    if (targets.some(u => u.bot)) {
        return interaction.reply({ content: '❌ You can\'t target a bot.', flags: 64 });
    }

    const { record, error } = findOpenDirectLine(interaction);
    if (error) return interaction.reply({ content: error, flags: 64 });

    await interaction.deferReply({ flags: 64 });
    await directLineFlow.attachTargets(interaction, record, targets, remove);
}

async function handleFile(interaction) {
    const { record, error } = findOpenDirectLine(interaction);
    if (error) return interaction.reply({ content: error, flags: 64 });

    await directLineFlow.promptFileConfirm(interaction, record);
}

module.exports = async function direct_line(interaction) {
    if (!isAdminChannel(interaction, 'hr')) {
        return interaction.reply(denyMessage());
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') return handleCreate(interaction);
    if (sub === 'attach') return handleAttach(interaction);
    if (sub === 'file') return handleFile(interaction);

    return interaction.reply({ content: '❌ Unknown subcommand.', flags: 64 });
};
