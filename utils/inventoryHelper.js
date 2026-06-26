const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter, getCharacterInventory } = require('./leagueNotion');

const RARITY_COLORS = {
    'Common':    0xaaaaaa,
    'Uncommon':  0x1dc91d,
    'Rare':      0x4444ff,
    'Very Rare': 0x9900cc,
    'Legendary': 0xff6600,
    'Artifact':  0xfee75c,
};

async function sendItemDetail(interaction) {
    const serial  = interaction.options.getInteger('id');
    const isPublic = interaction.options.getBoolean('public') ?? false;

    await interaction.deferReply({ ephemeral: !isPublic });

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

    if (serial < 1 || serial > items.length) {
        return interaction.editReply({
            content: `Invalid item ID. You have **${items.length}** item(s) — use a number between **1** and **${items.length}**.`,
        });
    }

    const item = items[serial - 1];
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

module.exports = { sendItemDetail };
