const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getActiveCharacter,
    createDowntimeProgress,
    getDowntimeProgressById,
    getActiveDowntimeForCharacter,
    investDowntimeProgress,
    setDowntimeStatus,
    getCharacterGold,
    adjustCharacterNumbersUnlocked,
    withPageLock,
} = require('../utils/leagueNotion');
const { addAction, getAll: getAllPendingActions } = require('../utils/pendingActions');
const {
    loadBlueprints, resolveCostFromUID, getBlueprint, getBlueprintById, getBlueprintByKey,
    blueprintNeedsTierChoice, listTierChoices, nextDtaId, resolveCost, applyDowntimeOutput, getParamName, sumCosts,
} = require('../utils/downtime');
const leagueNotion = require('../utils/leagueNotion');
const { getCatalogueItemByName } = require('../utils/5etoolsCatalogue');
const { formatCurrency } = require('../utils/currency');
const { sendAdminLog } = require('../utils/adminLog');

function coerceParam(raw) {
    if (raw == null) return null;
    return raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
}

function formatGpCost(costs, params) {
    const { gpTotal, gpPerDay } = sumCosts(costs ?? [], params ?? {});
    const parts = [];
    if (gpTotal > 0) parts.push(formatCurrency(gpTotal));
    if (gpPerDay > 0) parts.push(`${formatCurrency(gpPerDay)}/day`);
    const hasAssistantCost = (costs ?? []).some(c => c.target === 'assistant');
    return (parts.length ? parts.join(' + ') : 'free') + (hasAssistantCost ? ' (+ assistant pay)' : '');
}

async function postToCharacterThread(client, char, embed) {
    const forumThreadId = char.properties['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
    if (!forumThreadId) return;
    const thread = await client.channels.fetch(forumThreadId).catch(() => null);
    if (thread) await thread.send({ embeds: [embed] });
}

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

// ─── /league downtime progress ─────────────────────────────────────────────────

async function handleDowntimeProgress(interaction) {
    await interaction.deferReply({ flags: 64 });

    const dtaId = interaction.options.getString('id').toUpperCase();
    const days  = interaction.options.getInteger('days');

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const progress = await getDowntimeProgressById(dtaId).catch(() => null);
    if (!progress) return interaction.editReply({ content: `❌ No downtime activity found with ID \`${dtaId}\`.` });

    const p = progress.properties;
    const status = p['Status']?.select?.name;
    if (status !== 'In Progress') return interaction.editReply({ content: `❌ This activity is not in progress (status: ${status}).` });

    const daysRequired  = p['Days Required']?.number ?? 0;
    const daysInvested  = p['Days Invested']?.number ?? 0;
    const goldRequired  = p['Gold Required']?.number ?? null;
    const activityName  = p['Activity Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const activityId    = p['Activity ID']?.rich_text?.[0]?.plain_text ?? null;
    const storedParam   = p['Param Value']?.rich_text?.[0]?.plain_text ?? null;
    const storedQuantity = p['Quantity']?.number ?? 1;
    const storedSpell    = p['Spell Name']?.rich_text?.[0]?.plain_text ?? null;
    const storedItem     = p['Item Choice']?.rich_text?.[0]?.plain_text ?? null;

    const remainingDays = daysRequired - daysInvested;
    if (days > remainingDays) return interaction.editReply({ content: `❌ Only ${remainingDays} day(s) remain on this activity.` });

    const currentDowntimeDays = char.properties['Downtime Days']?.number ?? 0;
    if (currentDowntimeDays < days) {
        return interaction.editReply({ content: `❌ Not enough downtime days. This costs **${days}** day(s), you have **${currentDowntimeDays}** banked.` });
    }

    const gpPerDay = goldRequired != null ? goldRequired / daysRequired : 0;
    const gpCost = Math.round(gpPerDay * days * 100) / 100;

    let blueprint = activityId ? getBlueprint(activityId) : null;
    if (!blueprint) {
        const blueprints = loadBlueprints();
        const matches = Object.entries(blueprints).filter(([, bp]) => bp.name === activityName);
        if (matches.length > 1) {
            console.warn(`[downtime progress] Ambiguous activity name "${activityName}" matches multiple blueprints: ${matches.map(([id]) => id).join(', ')}`);
        }
        blueprint = matches[0]?.[1] ?? null;
    }

    const newDaysInvested = daysInvested + days;
    const newGoldInvested = (p['Gold Invested']?.number ?? 0) + gpCost;
    const isComplete = newDaysInvested >= daysRequired;
    const needsCompletionApproval = isComplete && blueprint?.approval?.post;

    let currentGold;
    let stage = 'none'; // none -> resources_deducted -> progress_logged -> complete
    try {
        currentGold = await withPageLock(char.id, async () => {
            const gold = await getCharacterGold(char.id);
            if (gold < gpCost) {
                throw Object.assign(new Error('insufficient-gold'), { code: 'INSUFFICIENT_GOLD', gold });
            }
            await adjustCharacterNumbersUnlocked(char.id, { 'Gold': -gpCost, 'Downtime Days': -days });
            stage = 'resources_deducted';

            await investDowntimeProgress(progress.id, { daysInvested: newDaysInvested, goldInvested: newGoldInvested });
            stage = 'progress_logged';

            if (isComplete) await setDowntimeStatus(progress.id, needsCompletionApproval ? 'Pending Completion Approval' : 'Completed');
            stage = 'complete';
            return gold;
        });
    } catch (err) {
        if (err.code === 'INSUFFICIENT_GOLD') {
            return interaction.editReply({ content: `❌ Not enough gold. This costs **${formatCurrency(gpCost)}** for ${days} day(s), you have **${formatCurrency(err.gold)}**.` });
        }
        console.error('[downtime progress] Notion error:', err, { stage });
        if (stage !== 'none') {
            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Downtime Progress Failed Mid-Transaction — Needs Reconciliation')
                .setDescription(`Failed at stage \`${stage}\`. Error: ${err.message}`)
                .addFields(
                    { name: 'Character',       value: char.properties['Character Name']?.title?.[0]?.plain_text ?? char.id, inline: true },
                    { name: 'Player',          value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Gold/Days Deducted?', value: stage === 'none' ? 'No' : 'Yes', inline: true },
                    { name: 'Gold Cost',       value: `${formatCurrency(gpCost)}`, inline: true },
                    { name: 'Days Cost',       value: `${days}`,                    inline: true },
                    { name: 'Progress Logged?', value: (stage === 'progress_logged' || stage === 'complete') ? 'Yes' : 'No — days/gold were deducted but progress was not recorded', inline: false },
                )
                .setTimestamp()
            );
            return interaction.editReply({ content: '❌ Something went partly wrong logging your progress. Your gold/days may already be spent — an admin has been notified to reconcile it.' });
        }
        return interaction.editReply({ content: '❌ Failed to log progress. Please try again.' });
    }

    let outputResult = null;
    if (isComplete && !needsCompletionApproval && blueprint?.output) {
        const tierValue = coerceParam(storedParam);
        try {
            outputResult = await applyDowntimeOutput({
                output: blueprint.output, characterPageId: char.id, activityName, tierValue,
                quantity: storedQuantity, spellName: storedSpell, itemChoice: storedItem,
            }, leagueNotion, interaction.client, interaction.guild);
        } catch (err) {
            console.error('[downtime progress] Failed to apply output:', err);
        }
    }
    
    if (outputResult) {
        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(outputResult.needsManualGrant ? 0xe67e22 : 0x2ecc71)
            .setTitle(outputResult.needsManualGrant ? '🎒 Downtime Output — Manual Grant Needed' : '🎁 Downtime Output Applied')
            .addFields(
                { name: 'DTA ID',   value: `\`${dtaId}\``, inline: true },
                { name: 'Activity', value: activityName, inline: true },
                { name: 'Player',   value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Output',   value: outputResult.message, inline: false },
            )
            .setTimestamp()
        );
    }

    let completionActionId = null;
    if (needsCompletionApproval) {
        const characterName = char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const created = addAction({
            type: 'downtime-completion',
            dm: { discordId: interaction.user.id }, // requester — the player whose activity completed
            target: { characterPageId: char.id, characterName, discordId: interaction.user.id },
            payload: {
                dtaId, notionPageId: progress.id, activityId, activityName,
                tierValue: coerceParam(storedParam), quantity: storedQuantity,
                spellName: storedSpell, itemChoice: storedItem,
            },
        });
        completionActionId = created.id;

        await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle('⏳ Downtime Completion Approval Needed')
            .addFields(
                { name: 'Action ID', value: `\`${completionActionId}\``, inline: true },
                { name: 'DTA ID',    value: `\`${dtaId}\``, inline: true },
                { name: 'Activity',  value: activityName, inline: true },
                { name: 'Player',    value: `<@${interaction.user.id}>`, inline: true },
            )
            .setTimestamp()
        );
    }

    const embed = new EmbedBuilder()
        .setColor(needsCompletionApproval ? 0xe67e22 : isComplete ? 0x2ecc71 : 0xf1c40f)
        .setTitle(needsCompletionApproval ? `⏳ Awaiting Completion Approval: ${activityName}` : isComplete ? `✅ Downtime Complete: ${activityName}` : `⏳ Downtime Progress: ${activityName}`)
        .addFields(
            { name: 'DTA ID', value: `\`${dtaId}\``, inline: true },
            { name: 'Days',   value: `${newDaysInvested} / ${daysRequired}`, inline: true },
            { name: 'Spent',  value: formatCurrency(gpCost), inline: true },
            ...(outputResult ? [{ name: 'Output', value: outputResult.message, inline: false }] : []),
        )
        .setTimestamp();
    
    await postToCharacterThread(interaction.client, char, embed);
    
    return interaction.editReply({
        content: (needsCompletionApproval
            ? `⏳ **${activityName}** — all ${daysRequired} day(s) logged! This activity requires an Admin sign-off before it finalizes. Completion approval request \`${completionActionId}\` sent to the admins.`
            : isComplete
	            ? `🎉 **${activityName}** complete!${outputResult ? ` ${outputResult.message}` : ''}`
	            : `✅ Logged ${days} day(s) on **${activityName}** (${newDaysInvested}/${daysRequired}). Spent ${formatCurrency(gpCost)}.`)
			+ ` (${currentDowntimeDays - days} downtime day(s) remaining)`,
    });
}

// ─── /league downtime buy-days ─────────────────────────────────────────────────

const REP_COST_PER_TOPUP = 1;
const DAYS_PER_TOPUP = 10;

async function handleDowntimeBuyDays(interaction) {
    await interaction.deferReply({ flags: 64 });

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const currentRep = char.properties['Reputation Points']?.number ?? 0;
    const currentDowntimeDays = char.properties['Downtime Days']?.number ?? 0;

    if (currentRep < REP_COST_PER_TOPUP) {
        return interaction.editReply({ content: `❌ You need **${REP_COST_PER_TOPUP} reputation point** to do this, you have **${currentRep}**.` });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dtbuy_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('dtbuy_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
        content: `Spend **${REP_COST_PER_TOPUP} reputation point** for **+${DAYS_PER_TOPUP} downtime days**?\n` +
            `Current: ${currentRep} RP, ${currentDowntimeDays} downtime day(s).\n` +
            `After: ${currentRep - REP_COST_PER_TOPUP} RP, ${currentDowntimeDays + DAYS_PER_TOPUP} downtime day(s).`,
        components: [row],
    });
}

// ─── /league downtime list ─────────────────────────────────────────────────────

function extrasNote(p) {
    const quantity = p['Quantity']?.number ?? 1;
    const spellName = p['Spell Name']?.rich_text?.[0]?.plain_text ?? null;
    const itemChoice = p['Item Choice']?.rich_text?.[0]?.plain_text ?? null;
    const parts = [
        quantity > 1 ? `${quantity}×` : null,
        spellName ? `spell: ${spellName}` : null,
        itemChoice ? `item: ${itemChoice}` : null,
    ].filter(Boolean);
    return parts.length ? ` [${parts.join(', ')}]` : '';
}

async function handleDowntimeList(interaction) {
    await interaction.deferReply({ flags: 64 });

    const char = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!char) return interaction.editReply({ content: '❌ No active character found.' });

    const active = await getActiveDowntimeForCharacter(char.id).catch(() => []);

    const myPending = getAllPendingActions().filter(a => a.target?.discordId === interaction.user.id);
    const pendingStart = myPending.filter(a => a.type === 'downtime-start');
    const pendingCompletion = myPending.filter(a => a.type === 'downtime-completion');

    if (active.length === 0 && pendingCompletion.length === 0 && pendingStart.length === 0) {
        return interaction.editReply({ content: '📋 No active or pending downtime activities.' });
    }

    const sections = [];

    if (active.length > 0) {
        const rows = active.map(a => {
            const p = a.properties;
            const id = p['DTA ID']?.rich_text?.[0]?.plain_text ?? '????';
            const name = p['Activity Name']?.title?.[0]?.plain_text ?? 'Unknown';
            const di = p['Days Invested']?.number ?? 0;
            const dr = p['Days Required']?.number ?? 0;
            return `\`${id}\`  ${name}${extrasNote(p)}  (${di}/${dr} days)`;
        });
        sections.push(`**In Progress**\n${rows.join('\n')}`);
    }

    if (pendingCompletion.length > 0) {
        const rows = pendingCompletion.map(a => {
            const d = a.payload ?? {};
            const extras = [
                d.quantity > 1 ? `${d.quantity}×` : null,
                d.spellName ? `spell: ${d.spellName}` : null,
                d.itemChoice ? `item: ${d.itemChoice}` : null,
            ].filter(Boolean).join(', ');
            return `\`${a.id}\`  ${d.activityName ?? d.dtaId}${extras ? ` (${extras})` : ''}  — ⏳ awaiting admin completion sign-off`;
        });
        sections.push(`**Awaiting Completion Approval**\n${rows.join('\n')}`);
    }

    if (pendingStart.length > 0) {
        const rows = pendingStart.map(r => {
            const d = r.details ?? {};
            const extras = [
                d.tierLabel ? d.tierLabel : null,
                d.quantity > 1 ? `${d.quantity}×` : null,
                d.spellName ? `spell: ${d.spellName}` : null,
                d.itemChoice ? `item: ${d.itemChoice}` : null,
            ].filter(Boolean).join(', ');
            return `\`${r.id}\`  ${d.activityName ?? r.payload?.uid}${extras ? ` (${extras})` : ''}  — ⏳ awaiting admin approval to start`;
        });
        sections.push(`**Awaiting Start Approval**\n${rows.join('\n')}`);
    }

    return interaction.editReply({ content: `📋 **Your Downtime Activities**\n\n${sections.join('\n\n')}` });
}

// ─── /league downtime activities ───────────────────────────────────────────────

async function handleDowntimeActivities(interaction) {
    await interaction.deferReply({ flags: 64 });

    const blueprints = loadBlueprints();
    const entries = Object.entries(blueprints);
    if (entries.length === 0) return interaction.editReply({ content: '📋 No downtime activities configured.' });

    const byCategory = {};
    for (const [key, bp] of entries) {
        (byCategory[bp.category ?? 'Uncategorized'] ??= []).push({ key, bp });
    }

    const sections = Object.keys(byCategory).sort().map(category => {
        const lines = byCategory[category]
            .sort((a, b) => a.bp.name.localeCompare(b.bp.name))
            .flatMap(({ bp }) => {
                const approvalNote = bp.approval?.pre ? ' 🔒pre' : bp.approval?.post ? ' 🔒post' : '';
                if (bp.tiers) {
                    if (bp.name === 'Catch Up (Gain a Milestone)') {
                        return [
                            `**${bp.name}**${approvalNote} — *tier auto-detected from your level*`,
                            ...bp.tiers.map(t => `  \`${t.id}\`  Tier ${t.value}  · ${t.daysRequired}d · ${formatGpCost(t.costs, {})}`),
                        ];
                    }
                    return [
                        `**${bp.name}**${approvalNote}`,
                        ...bp.tiers.map(t => {
                            const pName = getParamName(bp);
                            return `  \`${t.id}\`  ${t.value ?? (t.min != null || t.max != null ? `${t.min ?? '–'}–${t.max ?? '–'}` : '')}  · ${t.daysRequired}d · ${formatGpCost(t.costs, pName ? { [pName]: t.value } : {})}`;
                        }),
                    ];
                }
                return [`\`${bp.id}\`  **${bp.name}**${approvalNote} — ${bp.daysRequired}d · ${formatGpCost(bp.costs, {})}`];
            });
        return `**__${category}__**\n${lines.join('\n')}`;
    });

    const content = `📋 **Downtime Activities** (reference only — use \`/league downtime start\` and pick from the autocomplete)\n\n${sections.join('\n\n')}`;

    if (content.length <= 2000) return interaction.editReply({ content });
    const chunks = [];
    let current = '';
    for (const section of sections) {
        if ((current + '\n\n' + section).length > 1900) { chunks.push(current); current = section; }
        else current = current ? `${current}\n\n${section}` : section;
    }
    if (current) chunks.push(current);
    await interaction.editReply({ content: `📋 **Downtime Activities** (reference only — use \`/league downtime start\` and pick from the autocomplete)\n\n${chunks[0]}` });
    for (const chunk of chunks.slice(1)) await interaction.followUp({ content: chunk, flags: 64 });
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function leagueDowntime(interaction) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'start':      return handleDowntimeStart(interaction);
        case 'progress':   return handleDowntimeProgress(interaction);
        case 'list':       return handleDowntimeList(interaction);
        case 'buy-days':   return handleDowntimeBuyDays(interaction);
        case 'activities': return handleDowntimeActivities(interaction);
    }
}

module.exports = { leagueDowntime, handleDowntimeList, REP_COST_PER_TOPUP, DAYS_PER_TOPUP };
