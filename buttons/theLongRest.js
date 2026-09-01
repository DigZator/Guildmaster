const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
} = require('discord.js');
const memorialIndex = require('../utils/memorialIndex');

// ─── Dashboard message (posted via /the_long_rest setup) ───────────────────

function buildDashboardEmbed() {
    return new EmbedBuilder()
        .setTitle('🕯️ The Long Rest')
        .setDescription(
            'Click a button below.\n\n' +
            '**Submit a Memorial** — start a fallen-character memorial submission.\n' +
            '**Remove a Memorial** — request removal of a memorial you posted, by message ID.'
        )
        .setColor(0x5865f2);
}

function buildDashboardRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('tlrSubmit')
            .setLabel('Submit a Memorial')
            .setEmoji('🕯️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('tlrRemoveRequest')
            .setLabel('Remove a Memorial')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Secondary),
    );
}

// ─── Button handlers ─────────────────────────────────────────────────────

async function handleSubmitButton(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('characterSubmission_1')
        .setTitle('Character Memorial Submission - 1/2');

    const characterNameInput = new TextInputBuilder()
        .setCustomId('characterName')
        .setLabel('Character Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const speciesInput = new TextInputBuilder()
        .setCustomId('species')
        .setLabel('Species')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const classInput = new TextInputBuilder()
        .setCustomId('class')
        .setLabel('Class/Subclass')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const aliasesInput = new TextInputBuilder()
        .setCustomId('aliases')
        .setLabel('Aliases (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    const factionInput = new TextInputBuilder()
        .setCustomId('faction')
        .setLabel('Faction/Affiliation (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(characterNameInput),
        new ActionRowBuilder().addComponents(speciesInput),
        new ActionRowBuilder().addComponents(classInput),
        new ActionRowBuilder().addComponents(aliasesInput),
        new ActionRowBuilder().addComponents(factionInput)
    );

    await interaction.showModal(modal);
}

async function handleRemoveRequestButton(interaction) {
    const entries = memorialIndex.getEntriesForAuthor(interaction.user.id);

    if (entries.length === 0) {
        return interaction.reply({
            content: 'You don\'t have any memorials on record. If you posted one before this feature was added, ask an admin to run `/the_long_rest reindex`.',
            flags: 64,
        });
    }

    const sorted = entries.sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0)).slice(0, 25);

    const select = new StringSelectMenuBuilder()
        .setCustomId('tlrRemoveSelect')
        .setPlaceholder('Choose a memorial to remove')
        .addOptions(sorted.map(e => ({
            label: (e.characterName || 'Unknown Character').slice(0, 100),
            value: e.messageId,
        })));

    await interaction.reply({
        content: 'Which memorial would you like to remove?',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: 64,
    });
}

module.exports = {
    exact: {
        tlrSubmit: handleSubmitButton,
        tlrRemoveRequest: handleRemoveRequestButton,
    },
    buildDashboardEmbed,
    buildDashboardRow,
};
