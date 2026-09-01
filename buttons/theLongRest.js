const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { buildRemoveConfirmation } = require('../utils/tlrRemoveFlow');

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
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('tlrRemoveCancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('tlrRemoveProceed')
            .setLabel('Proceed')
            .setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
        content:
            '🗑️ **Remove a Memorial**\n\n' +
            'To remove a memorial you\'ll need the **Message ID** of the memorial post.\n\n' +
            '**How to find a Message ID:**\n' +
            '1. Enable Developer Mode: User Settings → Advanced → toggle **Developer Mode** on.\n' +
            '2. Go to the memorial post and right-click it (long-press on mobile).\n' +
            '3. Select **Copy Message ID** from the menu.\n\n' +
            'Once you\'ve got it, click **Proceed** and paste it into the form. You can only remove a memorial you posted yourself, unless you\'re a moderator.',
        components: [row],
        flags: 64,
    });
}

async function handleRemoveProceedButton(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('tlrRemoveModal')
        .setTitle('Remove a Memorial');

    const messageIdInput = new TextInputBuilder()
        .setCustomId('messageId')
        .setLabel('Memorial Message ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 1234567890123456789')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(messageIdInput));

    await interaction.showModal(modal);
}

async function handleRemoveCancelButton(interaction) {
    await interaction.update({ content: '❌ Memorial removal cancelled.', components: [] });
}

async function handleRemoveModalSubmit(interaction) {
    const messageId = interaction.fields.getTextInputValue('messageId').trim();

    const { payload } = await buildRemoveConfirmation(interaction, messageId);

    await interaction.reply({ ...payload, flags: 64 });
}

module.exports = {
    exact: {
        tlrSubmit: handleSubmitButton,
        tlrRemoveRequest: handleRemoveRequestButton,
        tlrRemoveProceed: handleRemoveProceedButton,
        tlrRemoveCancel: handleRemoveCancelButton,
    },
    handleRemoveModalSubmit,
    buildDashboardEmbed,
    buildDashboardRow,
};
