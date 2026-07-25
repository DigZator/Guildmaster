const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter, getCharacterInventory } = require('./leagueNotion');
const { formatCurrency } = require('./currency');
const { getCatalogueItemByName, defaultPriceFor } = require('./5etoolsCatalogue');

const RARITY_COLORS = {
    'Common':    0xaaaaaa,
    'Uncommon':  0x1dc91d,
    'Rare':      0x4444ff,
    'Very Rare': 0x9900cc,
    'Legendary': 0xff6600,
    'Artifact':  0xfee75c,
};

async function sendItemDetail(interaction) {
    const autoItemId  = interaction.options.getString('item');
    const serialInput = interaction.options.getInteger('id');
    const isPublic    = interaction.options.getBoolean('public') ?? false;

    if (!autoItemId && serialInput == null) {
        return interaction.reply({
            content: 'Pick an item from the list, or use `id` with the exact number from `/league inv` for a precise check.',
            flags: 64,
        });
    }

    await interaction.deferReply({ flags: isPublic ? 0 : 64 });

    let character;
    try {
        character = await getActiveCharacter(interaction.user.id);
    } catch (err) {
        console.error('[item] Notion error fetching character:', err);
        return interaction.editReply({ content: 'Could not reach the database. Please try again.' });
    }

    if (!character) {
        return interaction.editReply({
            content: 'You do not have an active character. Use `/league create` to register one.',
        });
    }

    let items;
    try {
        items = await getCharacterInventory(character.id);
    } catch (err) {
        console.error('[item] Notion error fetching inventory:', err);
        return interaction.editReply({ content: 'Could not load your inventory. Please try again.' });
    }

    items.sort((a, b) => {
        const dateA = a.properties['Date Acquired']?.date?.start ?? '';
        const dateB = b.properties['Date Acquired']?.date?.start ?? '';
        return dateA.localeCompare(dateB);
    });

    if (items.length === 0) {
        return interaction.editReply({ content: 'You have no items in your inventory.' });
    }

    let item, serial;
    if (autoItemId) {
        const index = items.findIndex(i => i.id === autoItemId);
        if (index === -1) {
            return interaction.editReply({ content: 'Could not find that item — please pick it again from the list.' });
        }
        item = items[index];
        serial = index + 1;
    } else {
        serial = serialInput;
        if (serial < 1 || serial > items.length) {
            return interaction.editReply({
                content: `Invalid item ID. You have **${items.length}** item(s) — use a number between **1** and **${items.length}**.`,
            });
        }
        item = items[serial - 1];
    }

    const p    = item.properties;

    const itemName   = p['Item Name']?.title?.[0]?.plain_text        ?? 'Unknown';
    const rarity     = p['Rarity']?.select?.name                     ?? '—';
    const type       = p['Type']?.select?.name                       ?? '—';
    const subtype    = p['Subtype']?.select?.name                    ?? null;
    const source     = p['Source']?.select?.name                     ?? '—';
    const sourceQuest= p['Source Quest']?.relation?.[0]?.id          ?? null;
    const dateAcq    = p['Date Acquired']?.date?.start               ?? '—';
    const itemValue  = p['Item Value']?.number                       ?? null;
    const notes      = p['Notes']?.rich_text?.[0]?.plain_text        ?? null;
    const ownerName  = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const username   = character.properties['Username']?.rich_text?.[0]?.plain_text   ?? 'Unknown';

    const color = RARITY_COLORS[rarity] ?? 0xaaaaaa;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${itemName}`)
        .addFields(
            { name: 'Rarity',        value: rarity,                                      inline: true  },
            { name: 'Type',          value: subtype ? `${type} — ${subtype}` : type,     inline: true  },
            { name: 'Source',        value: source,                                      inline: true  },
            { name: 'Date Acquired', value: dateAcq,                                     inline: true  },
            { name: 'Item Value',    value: itemValue != null ? `${itemValue} gp` : '—', inline: true  },
            { name: 'Owner',         value: `<@${interaction.user.id}> (${ownerName})`,  inline: true  },
        )

    if (sourceQuest) embed.addFields({ name: 'Source Quest', value: `\`${sourceQuest}\``, inline: false });
    if (notes)       embed.addFields({ name: 'Notes',        value: notes,                 inline: false });

    embed
        .setFooter({ text: `Item #${serial} of ${items.length} · ${username}` })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function getItemAutocompleteChoices(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();

    let character;
    try {
        character = await getActiveCharacter(interaction.user.id);
    } catch (err) {
        console.error('[item autocomplete] Notion error fetching character:', err);
        return [];
    }
    if (!character) return [];

    let items;
    try {
        items = await getCharacterInventory(character.id);
    } catch (err) {
        console.error('[item autocomplete] Notion error fetching inventory:', err);
        return [];
    }

    const matches = items.filter(item => {
        const name = item.properties['Item Name']?.title?.[0]?.plain_text ?? '';
        const rarity = item.properties['Rarity']?.select?.name ?? '';
        return name.toLowerCase().includes(focused) || rarity.toLowerCase().includes(focused);
    });

    return matches.slice(0, 25).map(item => {
        const p = item.properties;
        const itemName  = p['Item Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const rarity    = p['Rarity']?.select?.name ?? '—';
        let itemValue = p['Item Value']?.number ?? null;

        if (itemValue == null) {
            const catalogueItem = getCatalogueItemByName(itemName);
            if (catalogueItem) {
                itemValue = catalogueItem.priceGp ?? defaultPriceFor(catalogueItem.rarity);
            }
        }

        const priceStr  = itemValue != null ? formatCurrency(itemValue) : 'no price on file';

        let name = `${itemName} — ${rarity} — ${priceStr}`;
        if (name.length > 100) name = `${name.slice(0, 97)}...`;

        return { name, value: item.id };
    });
}

module.exports = { sendItemDetail, getItemAutocompleteChoices };
