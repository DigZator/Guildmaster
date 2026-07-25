const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { randomBytes }  = require('crypto');
const {
    getActiveCharacter,
    updatePageProperty,
    getPageById,
    withPageLock,
} = require('../utils/leagueNotion');
const { getCachedGames } = require('../utils/cache');
const { addAction, getAll, getById, removeById } = require('../utils/pendingActions');
const { sendAdminLog } = require('../utils/adminLog');

const DM_ROLE_ID = process.env.DM_ROLE_ID;

// ─── Notion setup ─────────────────────────────────────────────────────────────

const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const QUEST_LOG_DB_ID = process.env.LEAGUE_QUEST_LOG_DB_ID;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDM(interaction) {
    return interaction.member.roles.cache.has(DM_ROLE_ID);
}

async function generateQuestId() {
    let id, exists;
    do {
        id = randomBytes(2).toString('hex').toUpperCase();
        const response = await notion.dataSources.query({
            data_source_id: QUEST_LOG_DB_ID,
            filter: { property: 'Quest ID', rich_text: { equals: id } },
            page_size: 1,
        });
        exists = response.results.length > 0;
    } while (exists);
    return id;
}

async function getQuestById(questId) {
    const response = await notion.dataSources.query({
        data_source_id: QUEST_LOG_DB_ID,
        filter: { property: 'Quest ID', rich_text: { equals: questId.toUpperCase() } },
        page_size: 1,
    });
    return response.results[0] ?? null;
}

async function createQuestLogEntry({ questId, adventureName, date, tier, notes, goldAwarded }) {
    const properties = {
        'Adventure Name': { title: [{ text: { content: adventureName } }] },
        'Quest ID':       { rich_text: [{ text: { content: questId } }] },
        'Date':           { date: { start: date } },
        'Status':         { select: { name: 'Active' } },
        'Verified':       { checkbox: false },
    };
    if (tier)         properties['Tier']          = { select: { name: tier } };
    if (notes)        properties['Notes']         = { rich_text: [{ text: { content: notes } }] };
    if (goldAwarded)  properties['Gold Awarded']  = { number: goldAwarded };

    return notion.pages.create({
        parent: { data_source_id: QUEST_LOG_DB_ID },
        properties,
    });
}

async function createQuestLogEntryWithUniqueId(opts) {
    return withPageLock('__lock:quest-log-id', async () => {
        const questId = await generateQuestId();
        const page = await createQuestLogEntry({ ...opts, questId });
        return { questId, page };
    });
}

async function getQuestSummary(questId, { milestones = null, reputation = null } = {}) {
    const quest = await getQuestById(questId);
    if (!quest) return null;

    const questPageId   = quest.id;
    const adventureName = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const status         = quest.properties['Status']?.select?.name ?? 'Unknown';
    const goldAwarded    = quest.properties['Gold Awarded']?.number ?? 0;
    const characterIds   = quest.properties['Characters']?.relation?.map(r => r.id) ?? [];

    const players = [];
    for (const charId of characterIds) {
        const char = await getPageById(charId).catch(() => null);
        if (char) {
            players.push(char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown');
        }
    }

    const itemsResponse = await notion.dataSources.query({
        data_source_id: process.env.LEAGUE_INVENTORY_DB_ID,
        filter: { property: 'Source Quest', relation: { contains: questPageId } },
        page_size: 50,
    });
    const items = itemsResponse.results.map(page =>
        page.properties['Item Name']?.title?.[0]?.plain_text ?? 'Unknown Item'
    );

    return { questId, questPageId, adventureName, status, goldAwarded, players, items, milestones, reputation };
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

async function questLinkAutocomplete(interaction) {
    const focused   = interaction.options.getFocused().toLowerCase();
    const allGames  = await getCachedGames();
    const filtered  = allGames
        .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
        .filter(g => g.title.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(g => ({
            name: `${g.title.trim()} (${g.type} | ${g.date})`,
            value: g.uid,
        }));
    await interaction.respond(filtered);
}

// ─── /league quest list ────────────────────────────────────────────────────────

async function listQuests(interaction) {
    await interaction.deferReply({ flags: 64 });

    let response;
    try {
        response = await notion.dataSources.query({
            data_source_id: QUEST_LOG_DB_ID,
            sorts: [{ property: 'Date', direction: 'descending' }],
            page_size: 15,
        });
    } catch (err) {
        console.error('[league quest list] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not fetch quest list. Please try again.' });
    }

    if (response.results.length === 0) {
        return interaction.editReply({ content: 'No quests have been logged yet.' });
    }

    const lines = response.results.map(page => {
        const questId = page.properties['Quest ID']?.rich_text?.[0]?.plain_text ?? '???';
        const name    = page.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const date    = page.properties['Date']?.date?.start ?? 'Unknown date';
        const status  = page.properties['Status']?.select?.name ?? 'Unknown';
        return `\`${questId}\` — **${name}** (${date}) — ${status}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📜 League Quests')
        .setDescription(lines.join('\n'))
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

// ─── /leaguedm quest link ─────────────────────────────────────────────────────

async function handleQuestLink(interaction) {
    if (!isDM(interaction)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const gameUid = interaction.options.getString('game');
    const notes   = interaction.options.getString('notes') ?? null;

    // Pull game data from cache
    const allGames = await getCachedGames();
    const game     = allGames.find(g => g.uid === gameUid);
    if (!game) {
        return interaction.editReply({ content: '❌ Could not find that game. Please try again.' });
    }

    const adventureName = game.title;
    const date          = game.rawDate || new Date().toISOString().split('T')[0];
    const tier          = game.level ? String(Math.ceil(game.level / 4)) : null;

    const entry = addAction({
        type: 'quest-link',
        dm: { discordId: interaction.user.id, username: interaction.user.username },
        payload: { gameUid, adventureName, date, tier, notes },
    });

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('⏳ Quest Link — Pending')
        .addFields(
            { name: 'Adventure',    value: adventureName,               inline: true },
            { name: 'Date',         value: date,                        inline: true },
            { name: 'Requested By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Action ID',    value: `\`${entry.id}\``,           inline: false },
        )
        .setTimestamp()
    );

    return interaction.editReply({
        content: `✅ Quest link for **${adventureName}** submitted for approval. Action ID (For Admins): \`${entry.id}\``,
    });
}

// ─── /leaguedm quest complete ─────────────────────────────────────────────────

function buildQuestSummaryEmbed(summary, { title, color }) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .addFields(
            { name: 'Quest',       value: `${summary.adventureName} (\`${summary.questId}\`)`, inline: false },
            { name: 'Players',     value: summary.players.length ? summary.players.join(', ') : 'None linked', inline: false },
            { name: 'Gold Awarded', value: `${summary.goldAwarded} gp`, inline: true },
            { name: 'Milestones',   value: `${summary.milestones}`,     inline: true },
            { name: 'Reputation',   value: `${summary.reputation}`,     inline: true },
            { name: 'Items',        value: summary.items.length ? summary.items.join(', ') : 'None', inline: false },
        )
        .setTimestamp();
    return embed;
}

async function handleQuestComplete(interaction) {
    if (!isDM(interaction)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    const questId    = interaction.options.getString('quest_id').toUpperCase();
    const milestones = interaction.options.getInteger('milestones');
    const reputation = interaction.options.getInteger('reputation');

    await interaction.deferReply({ flags: 64 });

    const summary = await getQuestSummary(questId, { milestones, reputation });
    if (!summary) {
        return interaction.editReply({ content: `❌ No quest found with ID \`${questId}\`.` });
    }
    if (summary.status !== 'Active') {
        return interaction.editReply({ content: `❌ Quest must be **Active** to complete. Current status: ${summary.status}.` });
    }

    const embed = buildQuestSummaryEmbed(summary, {
        title: '📋 Confirm Quest Completion',
        color: 0xf1c40f,
    });

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`qc_confirm:${questId}:${milestones}:${reputation}`)
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('qc_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger),
    );

    return interaction.editReply({
        content: '⚠️ This is final — once submitted and approved, you will no longer be able to add players or grants to this quest.',
        embeds: [embed],
        components: [confirmRow],
    });
}

// ─── /leaguedm quest players add ─────────────────────────────────────────────

async function handleQuestPlayersAdd(interaction) {
    if (!isDM(interaction)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const questId = interaction.options.getString('quest_id').toUpperCase();
    const quest   = await getQuestById(questId);
    if (!quest) {
        return interaction.editReply({ content: `❌ No quest found with ID \`${questId}\`.` });
    }

    const questName = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const results   = [];

    for (let i = 1; i <= 6; i++) {
        const user = interaction.options.getUser(`user${i}`);
        if (!user) continue;

        const character = await getActiveCharacter(user.id).catch(() => null);
        if (!character) {
            results.push(`❌ **${user.username}** — no active character, skipped.`);
            continue;
        }

        const charName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

        // Get current characters and append
        const existing = quest.properties['Characters']?.relation?.map(r => r.id) ?? [];
        if (existing.includes(character.id)) {
            results.push(`⚠️ **${charName}** — already on this quest, skipped.`);
            continue;
        }

        try {
            await updatePageProperty(quest.id, {
                'Characters': { relation: [...existing, { id: character.id }].map(id => typeof id === 'string' ? { id } : id) },
            });
            results.push(`✅ **${charName}** added to **${questName}**.`);
        } catch (err) {
            console.error(`[quest players add] Error adding ${charName}:`, err);
            results.push(`❌ **${charName}** — failed to add, check logs.`);
        }
    }

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leaguedm quest players list ────────────────────────────────────────────

async function handleQuestPlayersList(interaction) {
    if (!isDM(interaction)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const questId = interaction.options.getString('quest_id').toUpperCase();
    const quest   = await getQuestById(questId);
    if (!quest) {
        return interaction.editReply({ content: `❌ No quest found with ID \`${questId}\`.` });
    }

    const questName     = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const characterIds  = quest.properties['Characters']?.relation?.map(r => r.id) ?? [];

    if (characterIds.length === 0) {
        return interaction.editReply({ content: `**${questName}** (\`${questId}\`) has no players linked yet.` });
    }

    const characters = await Promise.all(
        characterIds.map(id => getPageById(id).catch(() => null))
    );

    const lines = characters.map(char => {
        if (!char) return '❌ *Unknown character (may have been deleted)*';

        const name       = char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        const discordId  = char.properties['Discord ID']?.rich_text?.[0]?.plain_text ?? null;
        const className  = char.properties['Class']?.rich_text?.[0]?.plain_text ?? '—';
        const species    = char.properties['Species']?.rich_text?.[0]?.plain_text ?? '—';
        const level      = char.properties['Level']?.number ?? '—';
        const mention    = discordId ? `<@${discordId}>` : 'Unknown player';

        return `**${name}** (${mention}) — ${className}, ${species}, Level ${level}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`👥 Players — ${questName}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Quest ID: ${questId}` })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

// ─── /leaguedm quest players remove ──────────────────────────────────────────

async function handleQuestPlayersRemove(interaction) {
    if (!isDM(interaction)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const questId = interaction.options.getString('quest_id').toUpperCase();
    const quest   = await getQuestById(questId);
    if (!quest) {
        return interaction.editReply({ content: `❌ No quest found with ID \`${questId}\`.` });
    }

    const questName = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const existing  = quest.properties['Characters']?.relation?.map(r => r.id) ?? [];
    const results   = [];
    const toRemove  = new Set();

    for (let i = 1; i <= 6; i++) {
        const user = interaction.options.getUser(`user${i}`);
        if (!user) continue;

        const character = await getActiveCharacter(user.id).catch(() => null);
        if (!character) {
            results.push(`❌ **${user.username}** — no active character, skipped.`);
            continue;
        }

        const charName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
        if (!existing.includes(character.id)) {
            results.push(`⚠️ **${charName}** — not on this quest, skipped.`);
            continue;
        }

        toRemove.add(character.id);
        results.push(`✅ **${charName}** removed from **${questName}**.`);
    }

    if (toRemove.size > 0) {
        const updated = existing.filter(id => !toRemove.has(id)).map(id => ({ id }));
        try {
            await updatePageProperty(quest.id, { 'Characters': { relation: updated } });
        } catch (err) {
            console.error('[quest players remove] Error updating characters:', err);
            return interaction.editReply({ content: '❌ Failed to update characters. Check logs.' });
        }
    }

    return interaction.editReply({ content: results.join('\n') });
}

// ─── /leaguedm quest players clear ───────────────────────────────────────────

async function handleQuestPlayersClear(interaction) {
    if (!isDM(interaction)) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const questId = interaction.options.getString('quest_id').toUpperCase();
    const quest   = await getQuestById(questId);
    if (!quest) {
        return interaction.editReply({ content: `❌ No quest found with ID \`${questId}\`.` });
    }

    const questName = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';

    try {
        await updatePageProperty(quest.id, { 'Characters': { relation: [] } });
    } catch (err) {
        console.error('[quest players clear] Error:', err);
        return interaction.editReply({ content: '❌ Failed to clear characters. Check logs.' });
    }

    return interaction.editReply({ content: `✅ All characters cleared from **${questName}**.` });
}

// ─── Approve handlers (called from leagueGrants.js handleApprove) ─────────────

async function approveQuestLink(entry, interaction) {
    const { adventureName, date, tier, notes, goldAwarded } = entry.payload;

    const { questId, page } = await createQuestLogEntryWithUniqueId({ adventureName, date, tier, notes, goldAwarded });

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Quest Link Approved')
        .addFields(
            { name: 'Adventure',    value: adventureName,                   inline: true },
            { name: 'Date',         value: date,                            inline: true },
            { name: 'Approved By',  value: `<@${interaction.user.id}>`,     inline: true },
            { name: 'Requested By', value: `<@${entry.dm.discordId}>`,      inline: true },
            { name: 'Quest ID',     value: `\`${questId}\``,                inline: true },
            { name: '\u200b',       value: '\u200b',                        inline: true },
            { name: 'Action ID',    value: `\`${entry.id}\``,               inline: false },
        )
        .setTimestamp()
    );
    try {
    	const dmUser = await interaction.client.users.fetch(entry.dm.discordId);
    	await dmUser.send({
    		embeds:[
    			new EmbedBuilder()
    				.setColor(0x57f287)
    				.setTitle('Thanks for runnning a league game!')
    				.setDescription(
    					`Your quest **${adventureName}** has been approved and added to the league quest log.\n\n` +
    					`**Quest ID:** \`${questId}\`\n\n` +
    					`**Next steps:**\n` +
    					`• Use \`/leaguedm quest add\` to link your players' characters to this quest.\n` +
                        `• Use \`/leaguedm gold\`, \`/leaguedm rep\`, \`/leaguedm milestone\`, and \`/leaguedm item create\` (with this Quest ID) to submit rewards as you go.\n` +
                        `• When the game is fully wrapped up, use \`/league quest complete\` with this Quest ID to close it out.\n\n` +
                        `_(More detailed guidance coming soon — for now, reach out to a league admin if you have questions.)_`
    				)
    				.setTimestamp()
    		]
    	});
    } catch (err) {
    	console.warn(`[approveQuestLink] Failed to DM ${entry.dm.discordId}:`, err.message);
    	await sendAdminLog(interaction.guild, new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('⚠️ DM Notification Failed')
            .setDescription(`Direct message to <@${entry.dm.discordId}> failed. Their quest ID is \`${questId}\`.`)
            .setTimestamp()
        );
    }

    return { questId, pageId: page.id };
}

const DOWNTIME_DAYS_ON_QUEST_COMPLETE = 10;

async function approveQuestComplete(entry, interaction) {
    const { questId, questName, questPageId } = entry.quest;
    const { milestones, reputation } = entry.payload;

    await updatePageProperty(questPageId, { 'Status': { select: { name: 'Completed' } } });

    const quest = await getQuestById(questId).catch(() => null);
    const characterIds = quest?.properties['Characters']?.relation?.map(r => r.id) ?? [];
    const resetResults = await Promise.allSettled(
        characterIds.map(id => updatePageProperty(id, { 'Downtime Days': { number: DOWNTIME_DAYS_ON_QUEST_COMPLETE } }))
    );
    const resetFailures = resetResults.filter(r => r.status === 'rejected').length;
    if (resetFailures > 0) {
        console.error(`[approveQuestComplete] Failed to reset downtime days for ${resetFailures}/${characterIds.length} character(s) on quest ${questId}.`);
    }

    await sendAdminLog(interaction.guild, new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Quest Completed')
        .addFields(
            { name: 'Quest',        value: `${questName} (\`${questId}\`)`, inline: false },
            { name: 'Milestones',   value: `${milestones}`,                 inline: true },
            { name: 'Reputation',   value: `${reputation}`,                 inline: true },
            { name: 'Approved By',  value: `<@${interaction.user.id}>`,     inline: true },
            { name: 'Requested By', value: `<@${entry.dm.discordId}>`,      inline: true },
            { name: 'Downtime Days', value: `Reset to ${DOWNTIME_DAYS_ON_QUEST_COMPLETE} for ${characterIds.length - resetFailures}/${characterIds.length} roster character(s)`, inline: false },
            { name: 'Action ID',    value: `\`${entry.id}\``,               inline: false },
        )
        .setTimestamp()
    );
}

// ─── Routers ──────────────────────────────────────────────────────────────────

async function leagueDMQuest(interaction) {
    const sub   = interaction.options.getSubcommand();
    switch (sub) {
		case 'link': 		return handleQuestLink(interaction);
		case 'complete': 	return handleQuestComplete(interaction);
		case 'add': 		return handleQuestPlayersAdd(interaction);
		case 'remove': 		return handleQuestPlayersRemove(interaction);
		case 'clear': 		return handleQuestPlayersClear(interaction);
		case 'players':		return handleQuestPlayersList(interaction);
    }
}

module.exports = { leagueDMQuest, questLinkAutocomplete, approveQuestLink, approveQuestComplete, getQuestById, listQuests, getQuestSummary, buildQuestSummaryEmbed };
