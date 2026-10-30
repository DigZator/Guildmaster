const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
} = require('discord.js');
const { encodeId } = require('../../interactions/questDashboardId');
const { loadDashboardState, renderMainView } = require('../../interactions/questDashboardRender');
const { attachDashboardExpiry } = require('../../utils/dashboardExpiry');
const questDrafts = require('../../utils/questDrafts');
const { formatCurrency } = require('../../utils/currency');
const { getActiveCharacter, getCharacterInventory, getCharacterQuestLog } = require('../../utils/leagueNotion');
const { addCharacterToRoster, removeCharactersFromRoster } = require('../../commands/leagueQuest');
const { assertOwner, assertUnlocked, finishAndDelete, backRow, navRow, refreshDashboardMessage } = require('./common');

// Edit Party
async function handleEditParty(interaction, questId) {
    await interaction.deferReply({ flags: 64 });

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message });
    }

    const dashboardMessageId = interaction.message.id;
    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'partyAction', dashboardMessageId))
        .setPlaceholder('Add or remove a party member?')
        .addOptions(
            { label: 'Add Character',    value: 'add',    emoji: '➕' },
            { label: 'Remove Character', value: 'remove', emoji: '➖' },
        );

    return interaction.editReply({
        content: 'Add a character to the roster, or remove one?',
        components: [new ActionRowBuilder().addComponents(select), backRow(questId)],
    });
}

async function handlePartyActionSelect(interaction, questId, dashboardMessageId) {
    const action = interaction.values[0];

    if (action === 'add') {
        const select = new UserSelectMenuBuilder()
            .setCustomId(encodeId(questId, 'partyAddUser', dashboardMessageId))
            .setPlaceholder('Which player?');

        return interaction.update({
            content: 'Select the player whose **active character** should be added.',
            components: [new ActionRowBuilder().addComponents(select), navRow(questId, 'editParty')],
        });
    }

    // remove
    await interaction.deferUpdate();

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message, components: [] });
    }

    if (state.roster.length === 0) {
        return interaction.editReply({
            content: 'This quest has no characters on the roster yet.',
            components: [navRow(questId, 'editParty')],
        });
    }

    const options = [
        { label: '🗑️ Remove All Characters', value: '__all__', description: `Clears all ${state.roster.length} character(s) and their queued rewards` },
        ...state.roster.slice(0, 24).map(c => ({ label: c.characterName.slice(0, 100), value: c.characterPageId })),
    ];

    const select = new StringSelectMenuBuilder()
        .setCustomId(encodeId(questId, 'partyRemoveSelect', dashboardMessageId))
        .setPlaceholder('Which character to remove?')
        .addOptions(options);

    return interaction.editReply({
        content: 'Which character should be removed from the roster?',
        components: [new ActionRowBuilder().addComponents(select), navRow(questId, 'editParty')],
    });
}

// Edit Party — Add
async function handlePartyAddUserSelect(interaction, questId, dashboardMessageId) {
    await interaction.deferUpdate();

    const userId = interaction.values[0];

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message, components: [] });
    }

    const character = await getActiveCharacter(userId).catch(() => null);
    if (!character) {
        return interaction.editReply({
            content: `❌ <@${userId}> has no active character. Ask them to set one before adding them to this quest.`,
            components: [],
        });
    }

    const charName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    if (state.roster.some(c => c.characterPageId === character.id)) {
        return interaction.editReply({ content: `⚠️ **${charName}** is already on this quest's roster.`, components: [] });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyAddConfirm', `${character.id}|${dashboardMessageId}`))
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyAddCancel', dashboardMessageId))
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
        content: `This will add **${charName}** — <@${userId}>'s active character — to the roster. Is this correct?\n` +
            `If not, ask <@${userId}> to switch their active character to the right one and try again.`,
        components: [row],
    });
}

async function handlePartyAddConfirm(interaction, questId, extra) {
    await interaction.deferUpdate();

    const [characterId, dashboardMessageId] = extra.split('|');

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message, components: [] });
    }

    let result;
    try {
        result = await addCharacterToRoster(state.quest, characterId);
    } catch (err) {
        console.error(`[questDashboard] Error adding character ${characterId} to quest ${questId}:`, err);
        return interaction.editReply({ content: '❌ Failed to add character — check logs.', components: [] });
    }

    await refreshDashboardMessage(interaction, questId, dashboardMessageId);

    return finishAndDelete(interaction, {
        content: result.alreadyPresent ? '⚠️ Already on the roster — nothing changed.' : '✅ Character added to the roster.',
        components: [],
    });
}

async function handlePartyAddCancel(interaction) {
    return finishAndDelete(interaction, { content: 'Cancelled — nothing changed.', components: [] });
}

// Edit Party — Remove
async function handlePartyRemoveSelect(interaction, questId, dashboardMessageId) {
    await interaction.deferUpdate();

    const target = interaction.values[0];

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message, components: [] });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyRemoveConfirm', `${target}|${dashboardMessageId}`))
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyRemoveCancel', dashboardMessageId))
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
    );

    if (target === '__all__') {
        const lineCount = state.draft.lines.length;
        const warning = lineCount > 0
            ? `Removing all characters will also remove all **${lineCount}** queued reward line(s). `
            : '';
        return interaction.editReply({
            content: `⚠️ Are you sure you want to remove **all ${state.roster.length} character(s)** from this quest's roster? ${warning}This cannot be undone.`,
            components: [row],
        });
    }

    const character = state.roster.find(c => c.characterPageId === target);
    if (!character) {
        return interaction.editReply({ content: '❌ That character is no longer on the roster.', components: [] });
    }

    const lineCount = state.draft.lines.filter(l => l.characterPageId === target).length;
    const warning = lineCount > 0
        ? `⚠️ Removing **${character.characterName}** will also remove their **${lineCount}** queued reward line(s). Remove anyway?`
        : `Remove **${character.characterName}** from the roster?`;

    return interaction.editReply({ content: warning, components: [row] });
}

async function handlePartyRemoveConfirm(interaction, questId, extra) {
    await interaction.deferUpdate();

    const [target, dashboardMessageId] = extra.split('|');

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
        assertUnlocked(state);
    } catch (err) {
        return interaction.editReply({ content: err.message, components: [] });
    }

    const characterIds = target === '__all__'
        ? state.roster.map(c => c.characterPageId)
        : [target];

    try {
        await removeCharactersFromRoster(state.quest, characterIds);
    } catch (err) {
        console.error(`[questDashboard] Error removing character(s) ${characterIds.join(',')} from quest ${questId}:`, err);
        return interaction.editReply({ content: '❌ Failed to update the roster — check logs.', components: [] });
    }

    // Cascade: drop any draft lines belonging to removed characters.
    for (const line of state.draft.lines) {
        if (characterIds.includes(line.characterPageId)) {
            questDrafts.removeLine(questId, line.lineId);
        }
    }

    await refreshDashboardMessage(interaction, questId, dashboardMessageId);

    return finishAndDelete(interaction, {
        content: target === '__all__'
            ? '✅ All characters removed from the roster.'
            : '✅ Character removed from the roster.',
        components: [],
    });
}

async function handlePartyRemoveCancel(interaction) {
    return finishAndDelete(interaction, { content: 'Cancelled — nothing changed.', components: [] });
}

// Grouping toggle
async function handleToggleGroup(interaction, questId, grouping) {
    await interaction.deferUpdate().catch(() => {});

    const dashboardMessageId = interaction.message.id;

    let state;
    try {
        state = await loadDashboardState(questId, {
            discordId: interaction.user.id,
            username: interaction.user.username,
        });
        assertOwner(state, interaction);
    } catch (err) {
        return interaction.followUp({ content: err.message, flags: 64 }).catch(() => {});
    }

    const newMessage = await interaction.channel.send(renderMainView(state.draft, state.roster, { grouping, quest: state.quest }));
    attachDashboardExpiry(newMessage, questId);

    const oldMessage = await interaction.channel.messages.fetch(dashboardMessageId).catch(() => null);
    if (oldMessage) await oldMessage.delete().catch(() => {});
}

// Roster — read-only view
async function buildPartyInfoEmbed(state, index) {
    const character = state.roster[index];
    const total = state.roster.length;

    const [inventory, questLog] = await Promise.all([
        getCharacterInventory(character.characterPageId).catch(() => []),
        getCharacterQuestLog(character.characterPageId).catch(() => []),
    ]);

    const topItems = inventory
        .map(item => ({
            name: item.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown Item',
            value: item.properties['Item Value']?.number ?? 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

    const itemBlock = topItems.length > 0
        ? '```\n' + topItems.map(i => `${i.name.slice(0, 28).padEnd(28)} ${formatCurrency(i.value)}`).join('\n') + '\n```'
        : '_No items in inventory._';

    const lastQuest = questLog.find(q =>
        q.id !== state.quest.id && q.properties['Status']?.select?.name === 'Completed'
    );
    const lastQuestText = lastQuest
        ? `${lastQuest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown'} (${lastQuest.properties['Date']?.date?.start ?? 'unknown date'})`
        : '_No completed quests on record._';

    const lineCount = state.draft.lines.filter(l => l.characterPageId === character.characterPageId).length;

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${character.characterName}${character.discordId ? ` — <@${character.discordId}>` : ''}`)
        .addFields(
            { name: 'Level',                  value: character.level != null ? `${character.level}` : '—', inline: true },
            { name: 'Class',                  value: character.className ?? '—', inline: true },
            { name: 'Species',                value: character.species ?? '—',   inline: true },
            { name: 'Top 3 Items (by value)', value: itemBlock,                  inline: false },
            { name: 'Last Quest',             value: lastQuestText,              inline: false },
        );

    if (lineCount > 0) {
        embed.addFields({ name: 'Queued This Quest', value: `${lineCount} reward line(s)`, inline: false });
    }

    embed.setFooter({ text: `Character ${index + 1} of ${total} — ${state.questName} (${state.questId})` });

    return embed;
}

async function respondPartyInfo(interaction, questId, index, isUpdate) {
    if (isUpdate) {
        await interaction.deferUpdate();
    } else {
        await interaction.deferReply({ flags: 64 });
    }

    let state;
    try {
        state = await loadDashboardState(questId, null);
    } catch (err) {
        return interaction.editReply({ content: err.message, embeds: [], components: [] });
    }

    if (state.roster.length === 0) {
        return interaction.editReply({ content: 'This quest has no characters on the roster yet.', embeds: [], components: [] });
    }

    const safeIndex = Math.max(0, Math.min(index, state.roster.length - 1));
    const embed = await buildPartyInfoEmbed(state, safeIndex);

    const pageNavRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyInfoPage', String(safeIndex - 1)))
            .setLabel('◀ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safeIndex <= 0),
        new ButtonBuilder()
            .setCustomId(encodeId(questId, 'partyInfoPage', String(safeIndex + 1)))
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(safeIndex >= state.roster.length - 1),
    );

    return interaction.editReply({ content: '', embeds: [embed], components: [pageNavRow, backRow(questId)] });
}

async function handlePartyInfo(interaction, questId) {
    return respondPartyInfo(interaction, questId, 0, false);
}

async function handlePartyInfoPage(interaction, questId, extra) {
    return respondPartyInfo(interaction, questId, parseInt(extra, 10) || 0, true);
}

module.exports = {
    handleEditParty,
    handlePartyActionSelect,
    handlePartyAddUserSelect,
    handlePartyAddConfirm,
    handlePartyAddCancel,
    handlePartyRemoveSelect,
    handlePartyRemoveConfirm,
    handlePartyRemoveCancel,
    handleToggleGroup,
    handlePartyInfo,
    handlePartyInfoPage,
};
