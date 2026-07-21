const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { currentStep, applyPick, isComplete } = require('../utils/starterEquipmentFlow');
const {
    createInventoryItem,
    adjustCharacterNumber,
    updatePageProperty,
    setItemStatus,
    getPageById,
} = require('../utils/leagueNotion');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

const TIMEOUT_MS = 10 * 60 * 1000;
const sessions = new Map();
const timeouts = new Map();

function scheduleTimeout(message) {
    if (timeouts.has(message.id)) clearTimeout(timeouts.get(message.id));
    const handle = setTimeout(async () => {
        timeouts.delete(message.id);
        sessions.delete(message.id);
        try { await message.edit({ components: [] }); } catch {}
    }, TIMEOUT_MS);
    timeouts.set(message.id, handle);
}

function buildCancelRow() {
    return new ButtonBuilder().setCustomId('startitems_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger);
}

function buildOptionButtons(step) {
    const labels = step.type === 'chooseCategoryGroup'
        ? step.types
        : step.options.map(o => o.optionKey);

    const buttons = labels.map((label, idx) =>
        new ButtonBuilder()
            .setCustomId(`startitems_pick_${idx}`)
            .setLabel(step.type === 'chooseCategoryGroup' ? label : `Option ${label}`)
            .setStyle(ButtonStyle.Primary)
    );
    buttons.push(buildCancelRow());

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    return rows;
}

function buildSelectRow(step) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('starter_items_select')
        .setPlaceholder(`Choose your ${step.source}`)
        .addOptions(step.options.slice(0, 25).map((o, idx) => ({
            label: o.displayName.slice(0, 100),
            value: String(idx),
        })));
    return [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(buildCancelRow())];
}

function describeStepEntries(step) {
    if (step.type === 'chooseOption') {
        return step.options.map(o => {
            const parts = o.entries.map(e => {
                if (e.kind === 'item') return e.quantity > 1 ? `${e.displayName} x${e.quantity}` : e.displayName;
                if (e.kind === 'gold') return `${(e.cp / 100).toFixed(0)}gp`;
                if (e.kind === 'category') return `(pick a ${e.type})`;
                if (e.kind === 'categoryChoice') return `(pick a category)`;
                if (e.kind === 'informational') return e.label;
                return null;
            }).filter(Boolean);
            return `**Option ${o.optionKey}:** ${parts.join(', ')}`;
        }).join('\n');
    }
    return null;
}

function buildStepEmbed(step) {
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`Starting Equipment — ${step.source}`);
    const desc = describeStepEntries(step);
    if (desc) embed.setDescription(desc);
    else if (step.type === 'chooseCategoryItem') embed.setDescription('Pick one from the dropdown below.');
    else if (step.type === 'chooseCategoryGroup') embed.setDescription('Pick a category, then you\'ll choose the specific item.');
    return embed;
}

async function renderStep(interaction, session, message) {
    const step = currentStep(session);

    if (!step) {
        return renderConfirm(interaction, session, message);
    }

    const embed = buildStepEmbed(step);
    const components = step.type === 'chooseCategoryItem' ? buildSelectRow(step) : buildOptionButtons(step);

    const edited = await interaction.editReply({ embeds: [embed], components, fetchReply: true });
    sessions.set(edited.id, session);
    scheduleTimeout(edited);
}

function buildConfirmEmbed(session) {
    const { items, goldCp, informational, skipped } = session.resolved;
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Confirm Starting Equipment')
        .setDescription(items.length
            ? items.map(i => `• ${i.displayName}${i.quantity > 1 ? ` x${i.quantity}` : ''} _(${i.type})_`).join('\n')
            : '_No items_')
        .addFields({ name: 'Gold', value: `${(goldCp / 100).toFixed(0)} gp`, inline: true });

    if (informational.length) {
        embed.addFields({ name: 'Also noted', value: informational.map(i => i.note).join('\n') });
    }
    if (skipped.length) {
        embed.addFields({ name: '⚠️ Could not resolve (skipped)', value: skipped.map(s => s.label).join(', ') });
    }
    return embed;
}

function buildConfirmRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('startitems_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
        buildCancelRow(),
    );
}

async function renderConfirm(interaction, session) {
    const embed = buildConfirmEmbed(session);
    const edited = await interaction.editReply({ embeds: [embed], components: [buildConfirmRow()], fetchReply: true });
    sessions.set(edited.id, session);
    scheduleTimeout(edited);
}

async function commitToInventory(session) {
    const createdItemIds = [];
    let goldApplied = false;

    try {
        for (const item of session.resolved.items) {
            const count = item.quantity ?? 1;
            for (let i = 0; i < count; i++) {
                const page = await createInventoryItem({
                    itemName: item.displayName,
                    characterPageId: session.characterId,
                    rarity: 'Common',
                    type: item.type,
                    subtype: item.subtype ?? undefined,
                    source: 'Starting Equipment',
                    status: 'Owned',
                });
                createdItemIds.push(page.id);
            }
        }

        if (session.resolved.goldCp > 0) {
            await adjustCharacterNumber(session.characterId, 'Gold', session.resolved.goldCp / 100);
            goldApplied = true;
        }

        await updatePageProperty(session.characterId, { 'Got SE': { checkbox: true } });
    } catch (err) {
        console.error('[starterItems] commit failed, rolling back:', err);
        await Promise.all(createdItemIds.map(id => setItemStatus(id, 'Destroyed').catch(() => {})));
        if (goldApplied) {
            await adjustCharacterNumber(session.characterId, 'Gold', -(session.resolved.goldCp / 100)).catch(() => {});
        }
        throw err;
    }
}

async function sendAdminLog(interaction, session) {
    const adminChannel = interaction.guild?.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
    if (!adminChannel) {
        console.warn('[starterItems] Admin log channel not found — LEAGUE_ADMIN_CHANNEL_ID may not be set.');
        return;
    }

    const { items, goldCp, informational, skipped } = session.resolved;

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎒 Starting Equipment Granted')
        .addFields(
            { name: 'Player',    value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Character', value: session.characterName,       inline: true },
            { name: 'Gold',      value: `${(goldCp / 100).toFixed(0)} gp`, inline: true },
            { name: 'Items', value: items.length
                ? items.map(i => `• ${i.displayName}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join('\n')
                : '_No items_' },
        )
        .setTimestamp();

    if (informational.length) {
        embed.addFields({ name: 'Also noted', value: informational.map(i => i.note).join('\n') });
    }
    if (skipped.length) {
        embed.addFields({ name: '⚠️ Skipped / needs manual review', value: skipped.map(s => s.label).join(', ') });
    }

    try {
        await adminChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('[starterItems] Failed to send admin log:', err);
    }
}

module.exports = {
    renderStep,
    __sessions: sessions,
    exact: {
        startitems_confirm: async (interaction) => {
            const messageId = interaction.message.id;
            const session = sessions.get(messageId);
            if (!session) return interaction.update({ content: '❌ Session expired.', embeds: [], components: [] });

            await interaction.deferUpdate();

            let freshCharacter;
            try {
                freshCharacter = await getPageById(session.characterId);
            } catch (err) {
                console.error('[starterItems] Failed to re-check character before commit:', err);
                await interaction.editReply({ content: '❌ Could not verify your character. Please try again.', embeds: [], components: [] });
                sessions.delete(messageId);
                return;
            }

            if (freshCharacter.properties['Got SE']?.checkbox) {
                await interaction.editReply({ content: '❌ You have already claimed your starting equipment for this character.', embeds: [], components: [] });
                sessions.delete(messageId);
                return;
            }

            try {
                await commitToInventory(session);
            } catch (err) {
                console.error('[starterItems] Failed to write items/gold:', err);
                await interaction.editReply({ content: '❌ Failed to add items — nothing was kept, please try again or contact an admin.', embeds: [], components: [] });
                sessions.delete(messageId);
                return;
            }

            const summary = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Starting Equipment Added')
                .setDescription(session.resolved.items.map(i => `• ${i.displayName}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join('\n') || '_No items_')
                .addFields({ name: 'Gold Added', value: `${(session.resolved.goldCp / 100).toFixed(0)} gp`, inline: true });

            if (session.resolved.informational.length) {
                summary.addFields({ name: 'Also noted', value: session.resolved.informational.map(i => i.note).join('\n') });
            }

            await interaction.editReply({ embeds: [summary], components: [] });
            await sendAdminLog(interaction, session);
            sessions.delete(messageId);
        },

        startitems_cancel: async (interaction) => {
            const messageId = interaction.message.id;
            sessions.delete(messageId);
            await interaction.update({ content: '❌ Cancelled — no items were added.', embeds: [], components: [] });
        },
    },
    prefix: {
        startitems_pick_: async (interaction) => {
            const messageId = interaction.message.id;
            const session = sessions.get(messageId);
            if (!session) return interaction.update({ content: '❌ Session expired.', embeds: [], components: [] });

            await interaction.deferUpdate();

            const pickIndex = parseInt(interaction.customId.split('_')[2], 10);
            try {
                applyPick(session, pickIndex);
            } catch (err) {
                console.error('[starterItems] applyPick failed:', err);
                await interaction.editReply({ content: '❌ Something went wrong with that choice.', embeds: [], components: [] });
                sessions.delete(messageId);
                return;
            }

            await renderStep(interaction, session);
        },
    },
};
