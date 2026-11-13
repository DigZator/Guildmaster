const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter, createDowntimeProgress } = require('../../../../utils/leagueNotion');
const { addAction } = require('../../../../utils/pendingActions');
const {
    resolveCostFromUID,
    getBlueprintById,
    getBlueprintByKey,
    blueprintNeedsTierChoice,
    listTierChoices,
    nextDtaId,
    getParamName,
} = require('../engine');
const { getCatalogueItemByName } = require('../../../../utils/5etoolsCatalogue');
const { formatCurrency } = require('../../../../utils/currency');
const { sendAdminLog } = require('../../../../utils/adminLog');

// ─── /league downtime start ────────────────────────────────────────────────────

const CATCH_UP_LEVEL_BRACKETS = [
    { min: 1,  max: 4,  tier: 1 },
    { min: 5,  max: 10, tier: 2 },
    { min: 11, max: 16, tier: 3 },
    { min: 17, max: 20, tier: 4 },
];

function getCatchUpTier(level) {
    return CATCH_UP_LEVEL_BRACKETS.find(b => level >= b.min && level <= b.max)?.tier ?? null;
}

const QUANTITY_ELIGIBLE_CATEGORIES = new Set(['Crafting']);

function tierChoiceHelp(key, blueprint) {
    const choices = listTierChoices(key);
    if (!choices.length) return '';
    const lines = choices.slice(0, 25).map(c => `\`${c.label}\``).join(', ');
    return `\nValid options for **${blueprint.name}**: ${lines}`;
}

async function handleDowntimeStart(interaction) {
    await interaction.deferReply({ flags: 64 });

    const activityKey = interaction.options.getString('activity');
    const tierId = interaction.options.getString('tier')?.trim() || null;
    const rawQuantity = interaction.options.getInteger('quantity');
    const spellName = interaction.options.getString('spell')?.trim() || null;
    const itemChoice = interaction.options.getString('item')?.trim() || null;

    const base = getBlueprintByKey(activityKey);
    if (!base) {
        return interaction.editReply({ content: `❌ Couldn't find that activity — please pick one from the \`activity\` autocomplete list rather than typing it out.` });
    }
    const { key, blueprint } = base;

    // ── Resolve tier (if this blueprint needs one) ─────────────────────────
    const needsTier = blueprintNeedsTierChoice(key, blueprint);
    let uid = blueprint.id;
    let tier = null;

    if (needsTier) {
        if (!tierId || tierId === '__none__') {
            return interaction.editReply({ content: `❌ **${blueprint.name}** needs a \`tier\` selection (e.g. rarity, spell level, or tool). Fill in \`activity\` first, then pick from the \`tier\` autocomplete that appears.${tierChoiceHelp(key, blueprint)}` });
        }
        tier = blueprint.tiers.find(t => String(t.id).toUpperCase() === tierId.toUpperCase());
        if (!tier) {
            return interaction.editReply({ content: `❌ \`${tierId}\` isn't a valid tier for **${blueprint.name}**. Please pick one from the \`tier\` autocomplete list.${tierChoiceHelp(key, blueprint)}` });
        }
        uid = tier.id;
    } else if (tierId) {
        return interaction.editReply({ content: `❌ **${blueprint.name}** doesn't take a \`tier\` option — leave it blank.` });
    }

    // ── Quantity ─────────────────────────────────────────────────────────
    const isQuantityEligible = QUANTITY_ELIGIBLE_CATEGORIES.has(blueprint.category);
    if (rawQuantity != null && !isQuantityEligible) {
        return interaction.editReply({ content: `❌ **${blueprint.name}** doesn't support batch quantity — only crafting activities do.` });
    }
    const quantity = isQuantityEligible ? (rawQuantity ?? 1) : 1;

    // ── Spell (Scribe a Spell Scroll only) ──────────────────────────────────
    const isSpellScroll = blueprint.output?.type === 'spellScroll';
    if (isSpellScroll && !spellName) {
        return interaction.editReply({ content: `❌ **${blueprint.name}** requires the \`spell\` option so the bot knows what to scribe — pick one from the autocomplete list, e.g. \`spell: Fireball\`.` });
    }
    if (!isSpellScroll && spellName) {
        return interaction.editReply({ content: `❌ The \`spell\` option only applies to **Scribe a Spell Scroll**.` });
    }

    // ── Magic item (Craft a Magic Item only) ────────────────────────────────
    const isMagicItem = blueprint.output?.type === 'magicItem';
    if (isMagicItem && !itemChoice) {
        return interaction.editReply({ content: `❌ **${blueprint.name}** requires the \`item\` option so the bot knows what to craft — pick one from the autocomplete list, e.g. \`item: Bag of Holding\`.` });
    }
    if (!isMagicItem && itemChoice) {
        return interaction.editReply({ content: `❌ The \`item\` option only applies to **Craft a Magic Item** activities.` });
    }
    if (isMagicItem && itemChoice) {
        const expectedRarity = typeof tier?.value === 'string' ? tier.value : null;
        const catalogueItem = getCatalogueItemByName(itemChoice);
        if (!catalogueItem || !catalogueItem.isMagic) {
            return interaction.editReply({ content: `❌ Couldn't find a magic item called **${itemChoice}** — please pick one from the \`item\` autocomplete list.` });
        }
        if (expectedRarity && catalogueItem.rarity !== expectedRarity) {
            return interaction.editReply({ content: `❌ **${catalogueItem.name}** is ${catalogueItem.rarity}, but you picked the **${expectedRarity}** tier of **${blueprint.name}**. Either change \`tier\` to \`${catalogueItem.rarity}\`, or pick a ${expectedRarity} item from the \`item\` autocomplete list (it's scoped to your chosen tier).` });
        }
    }

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    let cost;

    if (key === 'catch-up-level') {
        const currentLevel = char.properties['Level']?.number ?? 1;
        const tierNum = getCatchUpTier(currentLevel);
        if (!tierNum) return interaction.editReply({ content: `❌ Could not determine a catch-up tier for level ${currentLevel}.` });
        const tierResolved = getBlueprintById(`00${tierNum}`);
        if (!tierResolved) return interaction.editReply({ content: '❌ Catch-up tier configuration error.' });
        uid = `00${tierNum}`;
        cost = resolveCostFromUID(uid);
    } else {
        cost = resolveCostFromUID(uid, quantity);
    }

    if (!cost) return interaction.editReply({ content: `❌ Could not resolve a valid cost for **${blueprint.name}**. Please try again or contact an admin.` });

    if (blueprint.approval?.pre) {
        const characterName  = char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const className      = char.properties['Class']?.rich_text?.[0]?.plain_text ?? '—';
        const species        = char.properties['Species']?.rich_text?.[0]?.plain_text ?? '—';
        const forumThreadId  = char.properties['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
        const threadLink     = forumThreadId ? `https://discord.com/channels/${interaction.guild.id}/${forumThreadId}` : null;
        const tierText       = tier ? `${getParamName(blueprint) ?? 'Tier'}: **${tier.value}**` : null;

        const details = {
            characterName, className, species, forumThreadId,
            activityName: blueprint.name, tierLabel: tier?.value ?? null,
            quantity, spellName, itemChoice,
            daysRequired: cost.daysRequired, gpTotal: cost.gpTotal,
        };

        const { id: reqId } = addAction({
            type: 'downtime-start',
            dm: { discordId: interaction.user.id }, // requester — reusing the shared `dm` field name other action types use
            target: { characterPageId: char.id, characterName, discordId: interaction.user.id },
            payload: { uid, quantity, spellName, itemChoice },
            details,
        });

        const descriptionLines = [
            `**Activity:** ${blueprint.name}${tierText ? ` — ${tierText}` : ''}`,
            `**Requires:** ${cost.daysRequired} day(s)${cost.gpTotal ? ` and ${formatCurrency(cost.gpTotal)}` : ''}`,
            quantity > 1 ? `**Quantity:** ${quantity}×` : null,
            spellName ? `**Spell:** ${spellName}` : null,
            itemChoice ? `**Item:** ${itemChoice}` : null,
            blueprint.prerequisites?.length ? `**Self-attested prerequisites:** ${blueprint.prerequisites.map(p => p.description).join('; ')}` : null,
        ].filter(Boolean).join('\n');

        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle('⏳ Downtime Start Approval Requested')
            .addFields(
                { name: 'Request ID',     value: `\`${reqId}\``, inline: true },
                { name: 'Player',         value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
                { name: 'Character',      value: characterName, inline: true },
                { name: 'Class',          value: className, inline: true },
                { name: 'Species',        value: species, inline: true },
                { name: 'Character Post', value: threadLink ? `[Jump to thread](${threadLink})` : '—', inline: true },
            )
            .setDescription(descriptionLines)
            .setTimestamp()
        );
        return interaction.editReply({ content: `⏳ **${blueprint.name}**${tierText ? ` (${tier.value})` : ''} requires admin approval to begin. Request \`${reqId}\` submitted — you'll be able to see it in \`/league downtime list\` while it's pending.` });
    }

    const dtaId = nextDtaId();
    try {
        await createDowntimeProgress({
            dtaId, activityId: key, activityName: blueprint.name, characterPageId: char.id,
            activityType: blueprint.category, daysRequired: cost.daysRequired,
            daysInvested: 0, goldRequired: cost.gpTotal, goldInvested: 0, paramValue: cost.tierValue,
            quantity, spellName, itemChoice,
        });
    } catch (err) {
        console.error('[downtime start] Notion error:', err);
        return interaction.editReply({ content: '❌ Failed to start activity. Please try again.' });
    }

    const checksNote = blueprint.checks
        ? `\n🎲 Requires ${blueprint.checks.successesRequired}/${blueprint.checks.attempts} successful ${blueprint.checks.skill} checks (DC ${blueprint.checks.dc}) — tracked by your GM, not the bot.`
        : '';
    const batchNote = quantity > 1
        ? `\n📦 Crafting **${quantity}×** in this batch — you'll receive all ${quantity} item(s) together once the full ${cost.daysRequired} day(s) are invested. There's no partial hand-out mid-way.`
        : '';
    const spellNote = spellName ? `\n📜 Spell: **${spellName}**` : '';
    const itemNote = itemChoice ? `\n🔮 Item: **${itemChoice}**` : '';

    return interaction.editReply({
        content: `✅ Started **${blueprint.name}** — DTA ID \`${dtaId}\`. Requires ${cost.daysRequired} day(s)${cost.gpTotal != null ? ` and ${formatCurrency(cost.gpTotal)}` : ''}.${spellNote}${itemNote}${batchNote}${checksNote}\nUse \`/league downtime progress\` to invest days.`,
    });
}

module.exports = { handleDowntimeStart };
