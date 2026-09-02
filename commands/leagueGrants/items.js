const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../utils/isAdminChannel');
const { getActiveCharacter, createInventoryItem } = require('../../utils/leagueNotion');
const { getCatalogueItemByCode, defaultPriceFor } = require('../../utils/5etoolsCatalogue');
const questDrafts = require('../../utils/questDrafts');
const { sendAdminLog } = require('../../utils/adminLog');
const { DM_ROLE_ID, isDMOnQuest, resolveActiveQuest } = require('./shared');

async function resolveItemAssignment(interaction, label) {
    const targetUser = interaction.options.getUser('player');
    if (!targetUser) return { targetUser: null, characterPageId: null, characterName: null };

    let character;
    try {
        character = await getActiveCharacter(targetUser.id);
    } catch (err) {
        console.error(`[${label}] Notion error:`, err);
        throw { userMessage: '❌ Could not reach the database. Please try again.' };
    }
    if (!character) {
        throw { userMessage: `❌ **${targetUser.displayName}** does not have an active character.` };
    }
    return {
        targetUser,
        characterPageId: character.id,
        characterName: character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown',
    };
}

async function runAdminItemGrant(interaction, config) {
    const { label, replyVerb, embedTitle, resolveItem, successMessage } = config;

    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const resolvedItem = resolveItem(interaction);
    if (resolvedItem.error) return interaction.editReply({ content: resolvedItem.error });
    const { itemName, type, rarity, subtype, itemValue, source, notes, extraEmbedFields = [] } = resolvedItem;

    let assignment;
    try {
        assignment = await resolveItemAssignment(interaction, `leagueadmin ${label}`);
    } catch (err) {
        return interaction.editReply({ content: err.userMessage });
    }
    const { targetUser, characterPageId, characterName } = assignment;

    let page;
    try {
        page = await createInventoryItem({
            itemName, type, rarity, subtype, itemValue, source, notes,
            characterPageId,
            status: characterPageId ? 'Owned' : 'Stored',
        });
    } catch (err) {
        console.error(`[leagueadmin ${label}] Notion create error:`, err);
        return interaction.editReply({ content: `❌ Failed to ${replyVerb.toLowerCase()} item. Please try again.` });
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(embedTitle)
        .addFields(
            { name: 'Item',        value: itemName,                       inline: true },
            { name: 'Type',        value: `${type}${subtype ? ` — ${subtype}` : ''}`, inline: true },
            { name: 'Rarity',      value: rarity,                         inline: true },
            ...extraEmbedFields,
            { name: `${replyVerb} By`, value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Assigned To', value: characterName ? `${characterName} (<@${targetUser.id}>)` : 'Unassigned', inline: true },
            { name: 'Notion ID',   value: `\`${page.id}\``,               inline: false },
        )
        .setTimestamp()
    );

    const assignedMsg = characterName ? ` Assigned to **${characterName}**.` : ' Item is unassigned.';
    return interaction.editReply({ content: successMessage(itemName, assignedMsg, resolvedItem) });
}

// ─── /leagueadmin item create ──────────────────────────────────────────────────────────────────

async function handleAdminItemCreate(interaction) {
    return runAdminItemGrant(interaction, {
        label: 'item create',
        replyVerb: 'Created',
        embedTitle: '🎒 Item Created',
        resolveItem: i => ({
            itemName:  i.options.getString('name'),
            type:      i.options.getString('type'),
            rarity:    i.options.getString('rarity'),
            subtype:   i.options.getString('subtype'),
            itemValue: i.options.getInteger('value'),
            source:    i.options.getString('source'),
            notes:     i.options.getString('notes'),
        }),
        successMessage: (itemName, assignedMsg) => `✅ Created **${itemName}**.${assignedMsg}`,
    });
}

// ─── Catalogue → inventory item mapping ────────────────────────────────────────

const SUBTYPE_BY_CATALOGUE_TYPE = { Potion: 'Potion', Scroll: 'Spell Scroll', Ammunition: 'Ammo' };

function inferSubtype(catalogueItem) {
    return SUBTYPE_BY_CATALOGUE_TYPE[catalogueItem.type] ?? 'Other';
}

function resolveCatalogueImport(code, overrides = {}) {
    const catalogueItem = getCatalogueItemByCode(code);
    if (!catalogueItem) return { error: `❌ No catalogue item found for \`${code}\`. Try \`/league shop search\` to find the right code.` };

    return {
        itemName: catalogueItem.name,
        type:     catalogueItem.type,
        rarity:   catalogueItem.rarity,
        subtype:  inferSubtype(catalogueItem),
        itemValue: overrides.itemValue ?? catalogueItem.priceGp ?? defaultPriceFor(catalogueItem.rarity),
        notes:    overrides.notes ?? (catalogueItem.description ? catalogueItem.description.slice(0, 500) : undefined),
        catalogueCode: catalogueItem.code,
    };
}

// ─── /leagueadmin item import ───────────────────────────────────────────────────────────────

async function handleAdminItemImport(interaction) {
    return runAdminItemGrant(interaction, {
        label: 'item import',
        replyVerb: 'Imported',
        embedTitle: '🎒 Item Imported From Catalogue',
        resolveItem: i => {
            const code = i.options.getString('code');
            const valueOverride = i.options.getInteger('value');
            const notesOverride = i.options.getString('notes');
            const resolved = resolveCatalogueImport(code, { itemValue: valueOverride, notes: notesOverride });
            if (resolved.error) return { error: resolved.error };
            return {
                ...resolved,
                source: i.options.getString('source'),
                extraEmbedFields: [{ name: 'Catalogue Code', value: `\`${resolved.catalogueCode}\``, inline: true }],
            };
        },
        successMessage: (itemName, assignedMsg, resolvedItem) =>
            `✅ Imported **${itemName}** from the catalogue (\`${resolvedItem.catalogueCode}\`).${assignedMsg}`,
    });
}

// ─── Shared DM item-grant executor ─────────────────────────────────────────────

async function runDMItemGrant(interaction, config) {
    const { label, resolveItem, entryPrefix } = config;

    if (!interaction.member.roles.cache.has(DM_ROLE_ID)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const quest = await resolveActiveQuest(interaction);
    if (quest.error) {
        return interaction.editReply({ content: quest.error });
    }
    if (!isDMOnQuest(interaction, quest.questId)) {
        return interaction.editReply({ content: '❌ You are not the DM assigned to this quest.' });
    }

    const resolvedItem = resolveItem(interaction);
    if (resolvedItem.error) return interaction.editReply({ content: resolvedItem.error });
    const { itemName, type, rarity, subtype, itemValue, source, notes, extraEmbedFields = [] } = resolvedItem;

    const targetUser = interaction.options.getUser('player');

    let character;
    try {
        character = await getActiveCharacter(targetUser.id);
    } catch (err) {
        console.error(`[leaguedm ${label}] Notion error:`, err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }
    if (!character) {
        return interaction.editReply({ content: `❌ **${targetUser.displayName}** does not have an active character.` });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const onQuest = quest.characterIds.includes(character.id);
    const rosterNote = onQuest ? '' : ' ⚠️ not on quest roster';

    questDrafts.getOrCreateDraft(quest.questId, {
        questPageId: quest.questPageId,
        questName: quest.questName,
        dm: { discordId: interaction.user.id, username: interaction.user.username },
    });

    questDrafts.addOrReplaceLine(quest.questId, {
        characterPageId: character.id,
        characterName,
        discordId: targetUser.id,
        type: 'item',
        payload: { itemName, type, subtype, rarity, itemValue, source, notes },
    });

    return interaction.editReply({
        content: `✅ ${entryPrefix(itemName, resolvedItem)} for **${characterName}** added to the quest draft for \`${quest.questId}\`.${rosterNote}`,
    });
}

// ─── /leaguedm item create ──────────────────────────────────────────────────────────────────

async function handleDMItemCreate(interaction) {
    return runDMItemGrant(interaction, {
        label: 'item create',
        embedTitle: '⏳ Item Grant — Pending Approval',
        resolveItem: i => ({
            itemName:  i.options.getString('name'),
            type:      i.options.getString('type'),
            rarity:    i.options.getString('rarity'),
            subtype:   i.options.getString('subtype'),
            itemValue: i.options.getInteger('value'),
            source:    i.options.getString('source'),
            notes:     i.options.getString('notes'),
        }),
        entryPrefix: itemName => `**${itemName}**`,
    });
}

// ─── /leaguedm item import ──────────────────────────────────────────────────────────────────

async function handleDMItemImport(interaction) {
    return runDMItemGrant(interaction, {
        label: 'item import',
        embedTitle: '⏳ Item Grant (Catalogue Import) — Pending Approval',
        resolveItem: i => {
            const code = i.options.getString('code');
            const source = i.options.getString('source');
            const notesOverride = i.options.getString('notes');
            const resolved = resolveCatalogueImport(code, { notes: notesOverride });
            if (resolved.error) return { error: resolved.error };
            return {
                ...resolved,
                source,
                extraEmbedFields: [{ name: 'Catalogue Code', value: `\`${resolved.catalogueCode}\``, inline: true }],
            };
        },
        entryPrefix: (itemName, resolvedItem) => `**${itemName}** (imported from \`${resolvedItem.catalogueCode}\`)`,
    });
}

module.exports = {
    handleAdminItemCreate,
    handleAdminItemImport,
    handleDMItemCreate,
    handleDMItemImport,
};
