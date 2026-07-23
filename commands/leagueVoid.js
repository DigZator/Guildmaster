const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter, getCharacterInventory, setItemStatus, adjustCharacterNumber, getCharacterGold } = require('../utils/leagueNotion');
const { formatCurrency } = require('../utils/currency');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

async function sendVoidAuditLog(interaction, fields, color = 0x992d22) {
    const channel = interaction.guild.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
    if (!channel) return console.warn('[void] LEAGUE_ADMIN_CHANNEL_ID not found in cache.');
    await channel.send({
        embeds: [new EmbedBuilder().setColor(color).setTitle('🗑️ Player Void').addFields(...fields).setTimestamp()],
    }).catch(err => console.error('[void] Failed to send audit log:', err));
}

async function resolveOwnActiveCharacter(interaction) {
    const character = await getActiveCharacter(interaction.user.id);
    if (!character) {
        await interaction.editReply({ content: '❌ You do not have an active character.' });
        return null;
    }
    return character;
}

// ─── /league void item ───────────────────────────────────────────────
async function handleVoidItem(interaction) {
    await interaction.deferReply({ flags: 64 });

    const serial = interaction.options.getInteger('id');
    const character = await resolveOwnActiveCharacter(interaction);
    if (!character) return;

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    let items;
    try {
        items = await getCharacterInventory(character.id); // same order as /league inv
    } catch (err) {
        console.error('[void item] Notion error fetching inventory:', err);
        return interaction.editReply({ content: '❌ Could not load your inventory. Please try again.' });
    }

    if (serial < 1 || serial > items.length) {
        return interaction.editReply({
            content: `❌ Invalid item ID. You have **${items.length}** item(s) — use a number between **1** and **${items.length}** (matches \`/league inv\`).`,
        });
    }

    const item = items[serial - 1];
    const itemName = item.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';

    try {
        await setItemStatus(item.id, 'Destroyed');
    } catch (err) {
        console.error('[void item] Notion update error:', err);
        return interaction.editReply({ content: '❌ Failed to void that item. Please try again.' });
    }

    await sendVoidAuditLog(interaction, [
        { name: 'Character', value: characterName, inline: true },
        { name: 'Player',    value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Item',      value: `${itemName} (#${serial})`, inline: true },
    ]);

    return interaction.editReply({ content: `✅ Voided **${itemName}** from **${characterName}**'s inventory.` });
}

// ─── /league void gold ───────────────────────────────────────────────
async function handleVoidGold(interaction) {
    await interaction.deferReply({ flags: 64 });

    const amount = interaction.options.getNumber('amount'); // positive value to remove
    if (amount <= 0) {
        return interaction.editReply({ content: '❌ Amount must be greater than 0.' });
    }

    const character = await resolveOwnActiveCharacter(interaction);
    if (!character) return;

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    let currentGold;
    try {
        currentGold = await getCharacterGold(character.id);
    } catch (err) {
        console.error('[void gold] Notion error fetching gold:', err);
        return interaction.editReply({ content: '❌ Could not read your gold balance. Please try again.' });
    }

    if (amount > currentGold) {
        return interaction.editReply({
            content: `❌ You only have **${formatCurrency(currentGold)}** — cannot void ${formatCurrency(amount)}.`,
        });
    }

    try {
        await adjustCharacterNumber(character.id, 'Gold', -amount);
    } catch (err) {
        console.error('[void gold] Notion update error:', err);
        return interaction.editReply({ content: '❌ Failed to void gold. Please try again.' });
    }

    await sendVoidAuditLog(interaction, [
        { name: 'Character',  value: characterName, inline: true },
        { name: 'Player',     value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Voided',     value: formatCurrency(amount), inline: true },
        { name: 'New Total',  value: formatCurrency(currentGold - amount), inline: true },
    ]);

    return interaction.editReply({ content: `✅ Voided **${formatCurrency(amount)}** from **${characterName}**.` });
}

async function leagueVoid(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'item') return handleVoidItem(interaction);
    if (sub === 'gold') return handleVoidGold(interaction);
}

module.exports = { leagueVoid };
