const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getActiveCharacter, getPageById, getCharacterInventory } = require('../../../utils/leagueNotion');
const { getCatalogueItemByName, defaultPriceFor } = require('../../../utils/5etoolsCatalogue');
const { formatCurrency } = require('../../../utils/currency');
const { setPendingSell } = require('../../../utils/shopSellSessions');

// ─── /league shop sell ─────────────────────────────────────────────────────────

function priceItemForSale(item, labelForErrors) {
    const itemStatus = item.properties['Status']?.select?.name;
    if (itemStatus !== 'Owned') {
        return { error: `❌ ${labelForErrors} cannot be sold (current status: ${itemStatus}).` };
    }

    const itemName = item.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';
    let itemValue  = item.properties['Item Value']?.number ?? null;

    if (itemValue == null) {
        const catalogueItem = getCatalogueItemByName(itemName);
        if (catalogueItem) {
            itemValue = catalogueItem.priceGp ?? defaultPriceFor(catalogueItem.rarity);
        }
    }

    if (itemValue == null) {
        return { error: `❌ **${itemName}** has no value on file and cannot be sold. Contact an admin.` };
    }

    return {
        pageId: item.id,
        name: itemName,
        value: itemValue,
        sellPrice: itemValue / 2,
    };
}

async function handleShopSell(interaction) {
    await interaction.deferReply({ flags: 64 });

    const autoItemId  = interaction.options.getString('item');
    const legacyInput = interaction.options.getString('item_id');

    if (!autoItemId && !legacyInput) {
        return interaction.editReply({ content: '❌ Pick an item from the list, or use the legacy `item_id` field to sell multiple items at once.' });
    }
    if (autoItemId && legacyInput) {
        return interaction.editReply({ content: '❌ Use either the item picker or the legacy `item_id` field, not both.' });
    }

    const sellerChar = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!sellerChar) return interaction.editReply({ content: '❌ No active character found.' });

    const items = [];
    let usedLegacy = false;

    if (autoItemId) {
        let item;
        try {
            item = await getPageById(autoItemId);
        } catch (err) {
            console.error('[league shop sell] Notion error fetching item:', err);
            return interaction.editReply({ content: '❌ Could not find that item — please pick it again from the list.' });
        }

        const ownerId = item.properties['Character']?.relation?.[0]?.id ?? null;
        if (ownerId !== sellerChar.id) {
            return interaction.editReply({ content: '❌ That item does not belong to your active character. Please pick it again from the list.' });
        }

        const itemName = item.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const priced = priceItemForSale(item, `**${itemName}**`);
        if (priced.error) return interaction.editReply({ content: priced.error });
        items.push(priced);
    } else {
        usedLegacy = true;

        const itemIdInput = legacyInput.replace('#', '').trim();
        const rawIds = itemIdInput.split(',').map(s => s.trim()).filter(Boolean);

        const serials = [];
        for (const raw of rawIds) {
            const serial = parseInt(raw, 10);
            if (isNaN(serial) || serial < 1) {
                return interaction.editReply({ content: `❌ Invalid item ID \`${raw}\`. Use the \`#\` number(s) shown in \`/league inv\`, e.g. \`001\` or \`001,003\`.` });
            }
            serials.push(serial);
        }

        let inventory;
        try {
            inventory = await getCharacterInventory(sellerChar.id);
        } catch (err) {
            console.error('[league shop sell] Notion error:', err);
            return interaction.editReply({ content: '❌ Could not fetch your inventory. Please try again.' });
        }

        for (const serial of serials) {
            const item = inventory[serial - 1];
            if (!item) {
                return interaction.editReply({ content: `❌ No item at position \`#${String(serial).padStart(3, '0')}\` in your inventory.` });
            }

            const priced = priceItemForSale(item, `Item \`#${String(serial).padStart(3, '0')}\``);
            if (priced.error) return interaction.editReply({ content: priced.error });
            priced.serial = serial;
            items.push(priced);
        }

        const uniquePageIds = new Set(items.map(i => i.pageId));
        if (uniquePageIds.size !== items.length) {
            return interaction.editReply({ content: '❌ Duplicate item ID in your list.' });
        }
    }

    const totalPrice = items.reduce((sum, i) => sum + i.sellPrice, 0);

    setPendingSell(interaction.user.id, {
        char: sellerChar,
        characterName: sellerChar.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown',
        items,
        totalPrice,
    });

    const lines = items.map(i => i.serial != null
        ? `**${i.name}** (\`#${String(i.serial).padStart(3, '0')}\`) — ${formatCurrency(i.value)} → sells for **${formatCurrency(i.sellPrice)}**`
        : `**${i.name}** — ${formatCurrency(i.value)} → sells for **${formatCurrency(i.sellPrice)}**`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shopsell_confirm_yes').setLabel('Confirm sale').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('shopsell_confirm_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    const warning = usedLegacy
        ? '\n\n⚠️ You used the legacy positional method — this can fail or grab the wrong item if your inventory changed recently. Double-check the item(s) above before confirming.'
        : '';

    return interaction.editReply({
        content: `${lines.join('\n')}\n\nTotal payout: **${formatCurrency(totalPrice)}**.${warning} Confirm sale?`,
        components: [row],
    });
}

module.exports = {
    handleShopSell,
};
