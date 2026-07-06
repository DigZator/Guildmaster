const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getActiveCharacter, getCharacterInventory } = require('../utils/leagueNotion');

const PAGE_SIZE = 12;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const timeouts = new Map();

function buildInventoryEmbed(characterName, items, page, totalPages) {
    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`🎒 ${characterName}'s Inventory`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages} · ${items.length} item(s) total` })
        .setTimestamp();

    if (slice.length === 0) {
        embed.setDescription('No items found.');
    } else {
        const rows = slice.map((item, index) => {
            const p      = item.properties;
            const name   = (p['Item Name']?.title?.[0]?.plain_text ?? 'Unknown').padEnd(28);
            const rarity = (p['Rarity']?.select?.name ?? '—').padEnd(10);
            const type   = p['Type']?.select?.name ?? '—';
            const serial = String(start + index + 1).padStart(3, '0');
            return `#${serial}  ${name} ${rarity} ${type}`;
        });

        const header = `${'#'.padEnd(5)}${'Item'.padEnd(29)}${'Rarity'.padEnd(11)}Type`;
        const divider = '─'.repeat(58);

        embed.setDescription(`\`\`\`\n${header}\n${divider}\n${rows.join('\n')}\n\`\`\``);
    }

    return embed;
}

function buildPaginationRow(page, totalPages, messageId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`inv_prev_${page}_${messageId}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`inv_next_${page}_${messageId}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1),
    );
}

function scheduleTimeout(message, timeoutMs) {
    if (timeouts.has(message.id)) clearTimeout(timeouts.get(message.id));

    const handle = setTimeout(async () => {
        timeouts.delete(message.id);
        try {
            await message.edit({ components: [] });
        } catch (err) { }
    }, timeoutMs);

    timeouts.set(message.id, handle);
}

module.exports = {
    async sendInventory(interaction) {
        await interaction.deferReply({ flags: 64 });

        let character;
        try {
            character = await getActiveCharacter(interaction.user.id);
        } catch (err) {
            console.error('[inventory] Notion error fetching character:', err);
            return interaction.editReply({ content: 'Could not reach the database. Please try again.' });
        }

        if (!character) {
            return interaction.editReply({
                content: 'You do not have an active character. Use `/league create` to register one.',
            });
        }

        const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

        let items;
        try {
            items = await getCharacterInventory(character.id);
        } catch (err) {
            console.error('[inventory] Notion error fetching inventory:', err);
            return interaction.editReply({ content: 'Could not load your inventory. Please try again.' });
        }

        const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        const embed = buildInventoryEmbed(characterName, items, 0, totalPages);

        const message = await interaction.editReply({
            embeds: [embed],
            components: totalPages > 1 ? [buildPaginationRow(0, totalPages, 'init')] : [],
            fetchReply: true,
        });

        if (totalPages > 1) scheduleTimeout(message, TIMEOUT_MS);
        module.exports.inventorySessions.set(message.id, { characterName, items, totalPages });
    },

    inventorySessions: new Map(),

    prefix: {
        inv_prev_: async (interaction) => {
            await interaction.deferUpdate();
            const parts = interaction.customId.split('_'); // ['inv','prev', page, messageId]
            const page = parseInt(parts[2]) - 1;
            const messageId = interaction.message.id;
            const session = module.exports.inventorySessions.get(messageId);
            if (!session) return interaction.editReply({ content: '❌ Session expired.', components: [] });

            const { characterName, items, totalPages } = session;
            const embed = buildInventoryEmbed(characterName, items, page, totalPages);
            const message = await interaction.editReply({
                embeds: [embed],
                components: [buildPaginationRow(page, totalPages, messageId)],
                fetchReply: true,
            });
            scheduleTimeout(message, TIMEOUT_MS);
        },

        inv_next_: async (interaction) => {
            await interaction.deferUpdate();
            const parts = interaction.customId.split('_'); // ['inv','next', page, messageId]
            const page = parseInt(parts[2]) + 1;
            const messageId = interaction.message.id;
            const session = module.exports.inventorySessions.get(messageId);
            if (!session) return interaction.editReply({ content: '❌ Session expired.', components: [] });

            const { characterName, items, totalPages } = session;
            const embed = buildInventoryEmbed(characterName, items, page, totalPages);
            const message = await interaction.editReply({
                embeds: [embed],
                components: [buildPaginationRow(page, totalPages, messageId)],
                fetchReply: true,
            });
            scheduleTimeout(message, TIMEOUT_MS);
        },
    },
};
