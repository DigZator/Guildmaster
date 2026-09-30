const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { buildRemoveConfirmation } = require('../utils/tlrRemoveFlow');
const memorialIndex = require('../utils/memorialIndex');
const { isTlrMod } = require('../config/tlrRoles');
const { MEMORIAL_LIMITS } = require('../utils/memorialEmbed');

const MAX_SELECT_OPTIONS = 25; // Discord's limit for a select menu

// ─── Shared submission modal (Part 1) ──────────────────────────────────────

function buildSubmissionModal() {
    const modal = new ModalBuilder()
        .setCustomId('characterSubmission_1')
        .setTitle('Character Memorial Submission - 1/2');

    const input = (id, label, required, max) =>
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId(id)
                .setLabel(label)
                .setStyle(TextInputStyle.Short)
                .setRequired(required)
                .setMaxLength(max)
        );

    modal.addComponents(
        input('characterName', 'Character Name', true, MEMORIAL_LIMITS.name),
        input('species', 'Species', true, MEMORIAL_LIMITS.species),
        input('class', 'Class/Subclass', true, MEMORIAL_LIMITS.class),
        input('aliases', 'Aliases (optional)', false, MEMORIAL_LIMITS.aliases),
        input('faction', 'Faction/Affiliation (optional)', false, MEMORIAL_LIMITS.faction),
    );

    return modal;
}

// ─── Dashboard message (posted via /the_long_rest setup) ───────────────────

function buildDashboardEmbed() {
    return new EmbedBuilder()
        .setTitle('🕯️ The Long Rest')
        .setDescription(
            'Click a button below.\n\n' +
            '**Submit a Memorial** — start a fallen-character memorial submission.\n' +
            '**Remove a Memorial** — pick one of your own memorials to remove.'
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
    await interaction.showModal(buildSubmissionModal());
}

function formatPostedDate(timestamp) {
    if (!timestamp) return 'Unknown date';
    return new Date(timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function handleRemoveRequestButton(interaction) {
    const isMod = isTlrMod(interaction.member);

    const entries = memorialIndex
        .getEntriesForAuthor(interaction.user.id)
        .sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0));

    const rows = [];
    let content;

    if (entries.length > 0) {
        const shown = entries.slice(0, MAX_SELECT_OPTIONS);
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('tlrRemoveSelect')
                .setPlaceholder('Choose a memorial to remove')
                .addOptions(shown.map(entry => ({
                    label: String(entry.characterName || 'Unknown Character').slice(0, 100),
                    description: `Posted ${formatPostedDate(entry.postedAt)}`,
                    value: entry.messageId,
                }))),
        ));
        content =
            '🗑️ **Remove a Memorial**\n\n' +
            'Pick the memorial you want to remove. You\'ll be asked to confirm before anything is deleted.' +
            (entries.length > shown.length ? `\n\n_Showing your ${shown.length} most recent memorials._` : '');
    } else {
        content =
            '🗑️ **Remove a Memorial**\n\n' +
            'I couldn\'t find any memorials posted by you.' +
            (isMod ? '' : '\n\nIf you think this is a mistake, please contact a moderator.');
    }

    if (isMod) {
        content += '\n\n_Moderators can also remove any memorial by its message ID._';
    }

    const buttons = [
        new ButtonBuilder()
            .setCustomId('tlrRemoveCancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    ];
    if (isMod) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId('tlrRemoveProceed')
                .setLabel('Use a Message ID')
                .setStyle(ButtonStyle.Danger),
        );
    }
    rows.push(new ActionRowBuilder().addComponents(...buttons));

    await interaction.reply({ content, components: rows, flags: 64 });
}

async function handleRemoveSelect(interaction) {
    await interaction.deferUpdate();

    const messageId = interaction.values[0];
    const { payload } = await buildRemoveConfirmation(interaction, messageId);

    await interaction.editReply({
        content: payload.content,
        components: payload.components ?? [],
    });
}

async function handleRemoveProceedButton(interaction) {
    if (!isTlrMod(interaction.member)) {
        return interaction.reply({ content: '❌ Only moderators can remove a memorial by message ID.', flags: 64 });
    }

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
    handleRemoveSelect,
    handleRemoveModalSubmit,
    buildSubmissionModal,
    buildDashboardEmbed,
    buildDashboardRow,
};
