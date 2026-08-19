const { EmbedBuilder } = require('discord.js');
const { formatCurrency } = require('./currency');

const TYPE_META = {
    gold:      { emoji: '💰', label: 'Gold' },
    rep:       { emoji: '⭐', label: 'Rep' },
    item:      { emoji: '🎒', label: 'Item' },
    milestone: { emoji: '🏆', label: 'Milestone' },
};

const TYPE_ORDER = ['gold', 'rep', 'item', 'milestone'];

function typeMeta(type) {
    return TYPE_META[type] ?? { emoji: '❔', label: type };
}

function itemAverageValue(payload) {
    if (payload?.itemValue == null) return null;
    const buy = payload.itemValue;
    const sell = buy / 2;
    return (buy + sell) / 2;
}

// ---- per-line short text, shared by both grouping modes ----
function formatLine(line) {
    const { emoji, label } = typeMeta(line.type);
    const p = line.payload ?? {};

    switch (line.type) {
        case 'gold':
            return `${emoji} ${label}: ${p.amount > 0 ? '+' : ''}${formatCurrency(p.amount)}`;
        case 'rep':
            return `${emoji} ${label}: +${p.amount}`;
        case 'milestone':
            return `${emoji} ${label}: +${p.amount}`;
        case 'item': {
            const avg = itemAverageValue(p);
            const priceNote = avg != null ? ` — ~${formatCurrency(avg)} avg` : '';
            return `${emoji} ${label}: ${p.itemName ?? 'Unknown item'}${p.rarity ? ` (${p.rarity})` : ''}${priceNote}`;
        }
        default:
            return `${emoji} ${label}`;
    }
}

function fallbackCharacterName(characterPageId, roster) {
    return roster.find(c => c.characterPageId === characterPageId)?.characterName ?? 'Unknown Character';
}

// ---- shared header/footer ----
function baseEmbed(draft) {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Rewards — Quest ${draft.questId}${draft.questName ? ` (${draft.questName})` : ''}`)
        .setFooter({ text: `Status: ${draft.status}` })
        .setTimestamp();
}

// ---- by character ----
function buildByCharacterEmbed(draft, roster = []) {
    const embed = baseEmbed(draft);

    if (roster.length === 0) {
        embed.setDescription('_No characters on this quest yet._');
        return embed;
    }

    const linesByCharacter = new Map();
    for (const line of draft.lines) {
        const key = line.characterPageId;
        if (!linesByCharacter.has(key)) linesByCharacter.set(key, []);
        linesByCharacter.get(key).push(line);
    }

    for (const character of roster) {
        const lines = linesByCharacter.get(character.characterPageId) ?? [];
        const value = lines.length > 0
            ? lines.map(formatLine).join('\n')
            : '_— no rewards queued yet —_';
        embed.addFields({ name: character.characterName, value, inline: false });
    }

    return embed;
}

// ---- by reward type ----
function buildByRewardEmbed(draft, roster = []) {
    const embed = baseEmbed(draft);

    const rosterLine = roster.length > 0
        ? roster.map(c => c.characterName).join(', ')
        : '_No characters on this quest yet._';
    embed.addFields({ name: '👥 Roster', value: rosterLine, inline: false });

    const linesByType = new Map();
    for (const line of draft.lines) {
        if (!linesByType.has(line.type)) linesByType.set(line.type, []);
        linesByType.get(line.type).push(line);
    }

    const typesPresent = TYPE_ORDER.filter(t => (linesByType.get(t) ?? []).length > 0);

    if (typesPresent.length === 0) {
        embed.addFields({ name: '\u200b', value: '_No rewards queued yet._', inline: false });
        return embed;
    }

    for (const type of typesPresent) {
        const { emoji, label } = typeMeta(type);
        const lines = linesByType.get(type);
        const value = lines
            .map(line => {
                const name = line.characterName ?? fallbackCharacterName(line.characterPageId, roster);
                const detail = formatLine(line).replace(`${emoji} ${label}: `, '');
                return `**${name}** — ${detail}`;
            })
            .join('\n');
        embed.addFields({ name: `${emoji} ${label}`, value, inline: false });
    }

    return embed;
}

module.exports = {
    buildByCharacterEmbed,
    buildByRewardEmbed,
    formatLine,
    itemAverageValue,
};
