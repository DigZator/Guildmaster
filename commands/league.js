const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { randomBytes } = require('crypto');
const { getActiveCharacter, updateCharacterArt, updatePageProperty, getCharacterGold, adjustCharacterNumbersUnlocked, withTwoPageLocks, getCharactersByDiscordId, searchCharactersByName, queryLeaderboard, getCharacterQuestLog, getPageById } = require('../utils/leagueNotion');
const { buildLeagueCreateModal } = require('../modals/leagueCreate');
const { sendInventory } = require('../buttons/inventory');
const { sendItemDetail } = require('../utils/inventoryHelper');
const { LEAGUE_ADMIN_CHANNEL_ID, LEAGUE_ART_ARCHIVE_THREAD_ID, LEAGUE_PROFILES_FORUM_ID } = require('../data/channels');
const { leagueShop, leagueMarketplace } = require('./leagueShop');
const { listQuests, getQuestById } = require('./leagueQuest');
const { leagueDowntime } = require('./leagueDowntime');
const { leagueStarterItems } = require('./leagueStarterItems');
const { formatCurrency } = require('../utils/currency');
const { leagueVoid } = require('./leagueVoid');

const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB

async function league(interaction, client) {
	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand();

	if (group === 'shop') 			return leagueShop(interaction);
	if (group === 'marketplace') 	return leagueMarketplace(interaction);
	if (group === 'downtime') 		return leagueDowntime(interaction);
	if (group === 'quest') 			return handleQuestGroup(interaction);
	if (group === 'void') 			return leagueVoid(interaction);
	if (group === 'character') 	return handleCharacterGroup(interaction);
	
	switch (sub) {
		case 'create':
			return handleCreate(interaction);

		case 'profile':
			return showProfile(interaction);

		case 'edit':
			return editCharacter(interaction);

		case 'setart':
			return setCharacterArt(interaction, client);

		case 'inv':
			return sendInventory(interaction);

		case 'item':
			return sendItemDetail(interaction);

		case 'gold':
			return transferGold(interaction);

		case 'balance':
			return showBalance(interaction);

		case 'starter-items':
            return leagueStarterItems(interaction);

		case 'log':
			return showQuestLog(interaction);

		case 'leaderboard':
			return showLeaderboard(interaction, client);

		case 'dashboard': {
			await interaction.deferReply({ flags: 64 });
			const { buildDashboardEmbed, buildDashboardRows } = require('../buttons/leagueDashboard');
			const character = await getActiveCharacter(interaction.user.id).catch(() => null);
			return interaction.editReply({ embeds: [buildDashboardEmbed(character)], components: buildDashboardRows(!!character) });
		}

		default:
			return interaction.reply({
				content: 'Unknown subcommand.',
				flags: 64,
			});
	}
}

// ─── /league create ──────────────────────────────────────────────────────────

async function handleCreate(interaction) {
	  const forumId = LEAGUE_PROFILES_FORUM_ID;

	  const channel = interaction.channel;
	  const isThread = channel?.isThread?.();
	  const parentId = channel?.parentId;

	  if (!isThread || parentId !== forumId) {
		    return interaction.reply({
			      content:
			        	'You need to run `/league create` inside your character profile thread in the **#character-profiles** forum.',
			      flags: 64,
		    });
	  }

	  let existingCharacter;
	  try {
	    	existingCharacter = await getActiveCharacter(interaction.user.id);
	  } catch (err) {
		    console.error('[league create] Notion error during pre-check:', err);
		    return interaction.reply({
			      content: 'Could not reach the database right now. Please try again in a moment.',
			      flags: 64,
		    });
	  }

	  if (existingCharacter) {
	  	const name = existingCharacter.properties['Character Name']?.title?.[0]?.plain_text ?? 'your character';
	  	return interaction.reply({
	      			content: `You already have an active character: **${name}**. You can only register a new character after your current one is retired or deceased.`,
	      			flags: 64,
	    });
	  }

	  const modal = buildLeagueCreateModal();
	  return interaction.showModal(modal);
}

// ─── /league profile ─────────────────────────────────────────────────────────

async function showProfile(interaction) {
	const targetUser = interaction.options.getUser('user') ?? interaction.user;
	const isOwnProfile = targetUser.id === interaction.user.id;
	
	let existingCharacter;
	try {
		existingCharacter = await getActiveCharacter(targetUser.id);
	} catch (err) {
		console.error('[league profile] Notion error during pre-check:', err);
		return interaction.reply({
			content: `Could not reach the database right now. Please try again in a moment.`,
			flags: 64,
		});
	}

	if (!existingCharacter) {
		return interaction.reply({
			content: isOwnProfile
			? `You do not have an active character. If you wish to create one, make a thread in **#character-profiles** and use the \`/league create\` command.`
			: `**${targetUser.displayName}** does not have an active character.`,
			flags: 64,
		});
	}

	const p = existingCharacter.properties;
	const characterName = p['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
	const classLevels   = p['Class']?.rich_text?.[0]?.plain_text ?? 'Unknown';
	const level         = p['Level']?.number ?? 1;
	const username      = p['Username']?.rich_text?.[0]?.plain_text ?? 'Unknown';
	const forumThreadId = p['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
	const charArtURL    = p['CharArtURL']?.url ?? null;
	
	const profileEmbed = new EmbedBuilder()
		.setColor(0xfee75c)
		.setTitle(characterName)
		.addFields(
			{ name: 'Class',   value: classLevels,              inline: true },
			{ name: 'Level',   value: String(level),            inline: true },
			{ name: 'Player',  value: `<@${targetUser.id}>	(${username})`, inline: true },
			{ name: 'Thread',  value: forumThreadId ? `<#${forumThreadId}>` : 'N/A', inline: true },
		)
		.setTimestamp();

	if (charArtURL) profileEmbed.setThumbnail(charArtURL);

	return interaction.reply({ embeds: [profileEmbed] });
}

// ─── /league setart ─────────────────────────────────────────────────────────

async function setCharacterArt(interaction, client) {
    const channel  = interaction.channel;
    const isThread = channel?.isThread?.();
    const parentId = channel?.parentId;

    if (!isThread || parentId !== LEAGUE_PROFILES_FORUM_ID) {
        return interaction.reply({
            content: 'You need to run `/league setart` inside your character profile thread in the **#characters** forum.',
            flags: 64,
        });
    }

    await interaction.deferReply({ flags: 64 });

    const attachment = interaction.options.getAttachment('image');

    if (!attachment.contentType?.startsWith('image/')) {
        return interaction.editReply({ content: '❌ That file doesn\'t look like an image. Please upload a PNG, JPG, or GIF.' });
    }

    if (attachment.size > MAX_IMAGE_SIZE) {
        return interaction.editReply({ content: `❌ Image is too large. Maximum size is 8MB.` });
    }

    let character;
    try {
        character = await getActiveCharacter(interaction.user.id);
    } catch (err) {
        console.error('[setart] Notion error fetching character:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }

    if (!character) {
        return interaction.editReply({
            content: 'You do not have an active character. Use `/league create` to register one.',
        });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    // Re-host image in archive thread
    let permanentUrl;
    try {
        const archiveThread = await client.channels.fetch(LEAGUE_ART_ARCHIVE_THREAD_ID);
        const archiveMsg = await archiveThread.send({
            content: `**${characterName}** — \`<@${interaction.user.id}>\``,
            files: [{ attachment: attachment.url, name: attachment.name }],
        });
        permanentUrl = archiveMsg.attachments.first()?.url;
        if (!permanentUrl) throw new Error('No URL returned from archive message');
    } catch (err) {
        console.error('[setart] Failed to archive image:', err);
        return interaction.editReply({ content: '❌ Failed to store your image. Please try again.' });
    }

    try {
        await updateCharacterArt(character.id, permanentUrl);
    } catch (err) {
        console.error('[setart] Notion error updating art:', err);
        return interaction.editReply({ content: '❌ Failed to save your art. Please try again.' });
    }

    return interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Character Art Updated')
                .setDescription([
                    `**${characterName}'s** profile art has been saved.`,
                    '',
                    '🎨 **Reminder:** AI-generated artwork is not permitted.',
                ].join('\n'))
                .setThumbnail(permanentUrl),
        ],
    });
}

// ─── /league edit ─────────────────────────────────────────────────────────

async function editCharacter(interaction) {
    const name          = interaction.options.getString('name');
    const classLevels   = interaction.options.getString('class');
    const species       = interaction.options.getString('species');
    const background    = interaction.options.getString('background');
    const charSheetLink = interaction.options.getString('charsheet');

    if (!name && !classLevels && !species && !background && !charSheetLink) {
        return interaction.reply({
            content: 'Please provide at least one field to update.',
            flags: 64,
        });
    }

    await interaction.deferReply({ flags: 64 });

    let character;
    try {
        character = await getActiveCharacter(interaction.user.id);
    } catch (err) {
        console.error('[edit] Notion error fetching character:', err);
        return interaction.editReply({ content: 'Could not reach the database. Please try again.' });
    }

    if (!character) {
        return interaction.editReply({
            content: 'You do not have an active character. Use `/league create` to register one.',
        });
    }
    
    const updates = {};
    if (name)          updates['Character Name'] = { title: [{ text: { content: name } }] };
    if (classLevels)   updates['Class']          = { rich_text: [{ text: { content: classLevels } }] };
    if (species)       updates['Species']        = { rich_text: [{ text: { content: species } }] };
    if (background)    updates['Background']     = { rich_text: [{ text: { content: background } }] };
    if (charSheetLink) updates['CharSheetLink']  = { url: charSheetLink };

    try {
        await updatePageProperty(character.id, updates);
    } catch (err) {
        console.error('[edit] Notion error updating character:', err);
        return interaction.editReply({ content: 'Failed to save your changes. Please try again.' });
    }

    const p = character.properties;
    const characterName = name ?? p['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    const changeLines = [
        name          && `**Name:** ${p['Character Name']?.title?.[0]?.plain_text ?? '—'} → ${name}`,
        classLevels   && `**Class:** ${p['Class']?.rich_text?.[0]?.plain_text ?? '—'} → ${classLevels}`,
        species       && `**Species:** ${p['Species']?.rich_text?.[0]?.plain_text ?? '—'} → ${species}`,
        background    && `**Background:** ${p['Background']?.rich_text?.[0]?.plain_text ?? '—'} → ${background}`,
        charSheetLink && `**Sheet Link:** ${charSheetLink}`,
    ].filter(Boolean);

    const adminChannelId = LEAGUE_ADMIN_CHANNEL_ID;
    const adminChannel   = interaction.guild.channels.cache.get(adminChannelId);
    if (adminChannel) {
        await adminChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffa500)
                    .setTitle('📝 Character Edit Log')
                    .setDescription(changeLines.join('\n'))
                    .addFields(
                        { name: 'Character', value: characterName,               inline: true },
                        { name: 'Player',    value: `<@${interaction.user.id}>`, inline: true },
                    )
                    .setTimestamp(),
            ],
        });
    } else {
        console.warn('[edit] Admin log channel not found — LEAGUE_ADMIN_CHANNEL_ID may not be set.');
    }

    return interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Character Updated')
                .setDescription(changeLines.join('\n'))
                .setTimestamp(),
        ],
    });
}

// ─── /league gold ─────────────────────────────────────────────────────────

async function transferGold(interaction) {
    const targetUser = interaction.options.getUser('player');
    const amount     = interaction.options.getNumber('amount');

    if (targetUser.id === interaction.user.id) {
        return interaction.reply({
            content: '❌ You cannot transfer gold to yourself.',
            flags: 64,
        });
    }

    await interaction.deferReply({ flags: 64 });

    const adminChannelId = LEAGUE_ADMIN_CHANNEL_ID;
    const adminChannel   = interaction.guild.channels.cache.get(adminChannelId);

    let senderChar, receiverChar;
    try {
        [senderChar, receiverChar] = await Promise.all([
            getActiveCharacter(interaction.user.id),
            getActiveCharacter(targetUser.id),
        ]);
    } catch (err) {
        console.error('[gold] Notion error fetching characters:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }

    if (!senderChar) {
        return interaction.editReply({ content: '❌ You do not have an active character.' });
    }
    if (!receiverChar) {
        return interaction.editReply({ content: `❌ **${targetUser.displayName}** does not have an active character.` });
    }

    const senderName   = senderChar.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const receiverName = receiverChar.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    let senderGold, receiverGold;
    let stage = 'none'; // none -> sender_debited -> complete
    try {
        await withTwoPageLocks(senderChar.id, receiverChar.id, async () => {
            [senderGold, receiverGold] = await Promise.all([
                getCharacterGold(senderChar.id),
                getCharacterGold(receiverChar.id),
            ]);

            if (senderGold < amount) throw new Error('INSUFFICIENT_GOLD');

            await adjustCharacterNumbersUnlocked(senderChar.id, { Gold: -amount });
            stage = 'sender_debited';

            await adjustCharacterNumbersUnlocked(receiverChar.id, { Gold: amount });
            stage = 'complete';
        });
    } catch (err) {
        if (err.message === 'INSUFFICIENT_GOLD') {
            return interaction.editReply({
                content: `❌ You do not have enough gold. Current balance: **${formatCurrency(senderGold)}**.`,
            });
        }

        console.error('[gold] Notion error during transfer:', err, { stage });

        let actualSenderGold   = '?';
        let actualReceiverGold = '?';
        try {
            [actualSenderGold, actualReceiverGold] = await Promise.all([
                getCharacterGold(senderChar.id),
                getCharacterGold(receiverChar.id),
            ]);
        } catch (_) {}

        if (adminChannel) {
            await adminChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('🚨 Gold Transfer Error')
                        .setDescription(`A gold transfer failed mid-execution at stage \`${stage}\`. Manual review may be required.`)
                        .addFields(
                            { name: 'Sender',               value: `<@${interaction.user.id}> (${senderName})`,  inline: true },
                            { name: 'Receiver',             value: `<@${targetUser.id}> (${receiverName})`,      inline: true },
                            { name: 'Amount',               value: `${formatCurrency(amount)}`,                               inline: true },
                            { name: 'Sender Before',        value: `${formatCurrency(senderGold ?? '?')}`,                    inline: true },
                            { name: 'Receiver Before',      value: `${formatCurrency(receiverGold ?? '?')}`,                  inline: true },
                            { name: '\u200b',               value: '\u200b',                                     inline: true },
                            { name: 'Sender After (actual)',   value: `${formatCurrency(actualSenderGold)}`,                  inline: true },
                            { name: 'Receiver After (actual)', value: `${formatCurrency(actualReceiverGold)}`,                inline: true },
                            { name: 'Was Receiver Credited?', value: stage === 'complete' ? 'Yes' : 'No — sender was debited but receiver was not yet credited', inline: true },
                            { name: 'Error',                value: `\`${err.message}\``,                         inline: false },
                        )
                        .setTimestamp(),
                ],
            });
        }

        return interaction.editReply({
            content: '❌ The transfer failed partway through. Admins have been notified to review the balances.',
        });
    }

    const newSenderGold   = senderGold   - amount;
    const newReceiverGold = receiverGold + amount;

    if (adminChannel) {
        await adminChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffd700)
                    .setTitle('💰 Gold Transfer')
                    .addFields(
                        { name: 'From',   value: `<@${interaction.user.id}> (${senderName})`,                    inline: true },
                        { name: 'To',     value: `<@${targetUser.id}> (${receiverName})`,                        inline: true },
                        { name: 'Amount', value: `${formatCurrency(amount)}`,                                                 inline: true },
                        { name: `${senderName} Balance`,   value: `${formatCurrency(senderGold)} → ${formatCurrency(newSenderGold)}`,     inline: true },
                        { name: `${receiverName} Balance`, value: `${formatCurrency(receiverGold)} → ${formatCurrency(newReceiverGold)}`, inline: true },
                    )
                    .setTimestamp(),
            ],
        });
    }

    return interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('💰 Gold Transferred')
                .setDescription(`Successfully sent **${formatCurrency(amount)}** to **${receiverName}**.`)
                .addFields(
                    { name: 'Your new balance', value: `${formatCurrency(newSenderGold)}`, inline: true },
                )
                .setTimestamp(),
        ],
    });
}

// ─── /league balance ─────────────────────────────────────────────────────────
async function showBalance(interaction) {
	await interaction.deferReply({ flags: 64 });

	const char = await getActiveCharacter(interaction.user.id);
	if (!char) {
		return interaction.editReply({ content: '❌ No active character found.' });
	}

	const p = char.properties;
	const name        = p['Character Name'].title[0]?.plain_text ?? 'Unknown';
	const gold        = p['Gold'].number ?? 0;
	const rep         = p['Reputation Points'].number ?? 0;
	const milestones  = p['Milestones'].number ?? 0;

	const embed = new EmbedBuilder()
		.setTitle(`${name}'s Balance`)
		.addFields(
			{ name: '💰 Gold',             value: `${formatCurrency(gold)}`,        inline: true },
			{ name: '⭐ Reputation',        value: `${rep} pts`,        inline: true },
			{ name: '🏆 Milestones',        value: `${milestones}`,     inline: true },
		)
		.setColor(0xF1C40F);

	return interaction.editReply({ embeds: [embed] });
}

// ─── /league leaderboard ───────────────────────────────────────────────────────

const LEADERBOARD_LABELS = {
	level: 'Level',
	gold: 'Gold',
	reputation: 'Reputation',
	milestones: 'Milestones',
};

const LEADERBOARD_PAGE_SIZE = 10;
const LEADERBOARD_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

function truncate(str, max) {
	return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function buildLeaderboardEmbedAndRow(session, sessionId) {
	const { rows, sortBy, className, species, status, page } = session;
	const totalPages = Math.max(1, Math.ceil(rows.length / LEADERBOARD_PAGE_SIZE));
	const pageRows = rows
		.slice(page * LEADERBOARD_PAGE_SIZE, (page + 1) * LEADERBOARD_PAGE_SIZE)
		.map((char, i) => {
			const p = char.properties;
			return {
				rank:  `${page * LEADERBOARD_PAGE_SIZE + i + 1}`,
				name:  truncate(p['Character Name']?.title?.[0]?.plain_text ?? 'Unknown', 20),
				cls:   truncate(p['Class']?.rich_text?.[0]?.plain_text ?? '—', 18),
				level: `${p['Level']?.number ?? 0}`,
				gold:  `${p['Gold']?.number ?? 0}`,
				rep:   `${p['Reputation Points']?.number ?? 0}`,
			};
		});

	const rankWidth  = Math.max(4, ...pageRows.map(r => r.rank.length));
	const nameWidth  = Math.max(9, ...pageRows.map(r => r.name.length));
	const clsWidth   = Math.max(5, ...pageRows.map(r => r.cls.length));
	const lvlWidth   = Math.max(3, ...pageRows.map(r => r.level.length));
	const goldWidth  = Math.max(4, ...pageRows.map(r => r.gold.length));
	const repWidth   = Math.max(3, ...pageRows.map(r => r.rep.length));

	const header  = `${'#'.padEnd(rankWidth)}  ${'Character'.padEnd(nameWidth)}  ${'Class'.padEnd(clsWidth)}  ${'Lvl'.padEnd(lvlWidth)}  ${'Gold'.padEnd(goldWidth)}  Rep`;
	const divider = `${'-'.repeat(rankWidth)}  ${'-'.repeat(nameWidth)}  ${'-'.repeat(clsWidth)}  ${'-'.repeat(lvlWidth)}  ${'-'.repeat(goldWidth)}  ${'-'.repeat(repWidth)}`;
	const body    = pageRows.map(r =>
		`${r.rank.padEnd(rankWidth)}  ${r.name.padEnd(nameWidth)}  ${r.cls.padEnd(clsWidth)}  ${r.level.padEnd(lvlWidth)}  ${r.gold.padEnd(goldWidth)}  ${r.rep}`
	);

	const table = '```\n' + [header, divider, ...body].join('\n') + '\n```';

	const filterNotes = [];
	if (className) filterNotes.push(`Class: ${className}`);
	if (species)   filterNotes.push(`Species: ${species}`);
	if (status)    filterNotes.push(`Status: ${status}`);
	filterNotes.push(`Page ${page + 1}/${totalPages}`);

	const embed = new EmbedBuilder()
		.setColor(0xF1C40F)
		.setTitle(`🏆 Character Leaderboard — sorted by ${LEADERBOARD_LABELS[sortBy] ?? sortBy}`)
		.setDescription(table)
		.setFooter({ text: filterNotes.join(' • ') })
		.setTimestamp();

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`leaderboard_page:${sessionId}:prev`)
			.setLabel('◀ Previous')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page === 0),
		new ButtonBuilder()
			.setCustomId(`leaderboard_page:${sessionId}:next`)
			.setLabel('Next ▶')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= totalPages - 1),
	);

	return { embeds: [embed], components: [row] };
}

async function showLeaderboard(interaction, client) {
	const sortBy    = interaction.options.getString('sort_by') ?? 'level';
	const order     = interaction.options.getString('order') ?? 'descending';
	const className = interaction.options.getString('class');
	const species   = interaction.options.getString('species');
	const status    = interaction.options.getString('status');
	const isPublic  = interaction.options.getBoolean('public') ?? false;

	await interaction.deferReply({ flags: isPublic ? undefined : 64 });

	const rows = await queryLeaderboard({ sortBy, order, className, species, status });

	if (rows.length === 0) {
		return interaction.editReply({ content: 'No characters match those filters.' });
	}

	const sessionId = randomBytes(4).toString('hex');
	const session = { rows, sortBy, order, className, species, status, page: 0, requesterId: interaction.user.id };
	client.leaderboardSessions.set(sessionId, session);
	setTimeout(() => client.leaderboardSessions.delete(sessionId), LEADERBOARD_SESSION_TTL_MS);

	const payload = buildLeaderboardEmbedAndRow(session, sessionId);
	return interaction.editReply(payload);
}

async function handleQuestGroup(interaction) {
	const sub = interaction.options.getSubcommand();
	if (sub === 'list') return listQuests(interaction);
}

// ─── /league log ──────────────────────────────────────────────────────────────

function formatDateIST(dateString) {
	if (!dateString) return 'Unknown';
	const parsed = new Date(dateString);
	if (isNaN(parsed)) return dateString;
	return parsed.toLocaleDateString('en-IN', {
		timeZone: 'Asia/Kolkata',
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	});
}

async function resolveTargetCharacter(interaction) {
	const targetUser   = interaction.options.getUser('player') ?? interaction.user;
	const characterId  = interaction.options.getString('character');

	if (characterId) {
		const char = await getPageById(characterId).catch(() => null);
		return char;
	}

	return getActiveCharacter(targetUser.id);
}

async function showQuestLog(interaction) {
	await interaction.deferReply({ flags: 64 });

	const questId = interaction.options.getString('quest_id');

	if (questId) {
		const quest = await getQuestById(questId);
		if (!quest) {
			return interaction.editReply({ content: `❌ No quest found with ID \`${questId.toUpperCase()}\`.` });
		}

		const adventureName = quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown';
		const date           = formatDateIST(quest.properties['Date']?.date?.start);
		const status         = quest.properties['Status']?.select?.name ?? 'Unknown';
		const tier           = quest.properties['Tier']?.select?.name ?? null;
		const notes          = quest.properties['Notes']?.rich_text?.[0]?.plain_text ?? null;
		const characterIds   = quest.properties['Characters']?.relation?.map(r => r.id) ?? [];

		const characters = await Promise.all(
			characterIds.map(id => getPageById(id).catch(() => null))
		);

		const rosterLines = characters.map(char => {
			if (!char) return '❌ *Unknown character (may have been deleted)*';

			const name      = char.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
			const discordId = char.properties['Discord ID']?.rich_text?.[0]?.plain_text ?? null;
			const className = char.properties['Class']?.rich_text?.[0]?.plain_text ?? '—';
			const species   = char.properties['Species']?.rich_text?.[0]?.plain_text ?? '—';
			const level     = char.properties['Level']?.number ?? '—';
			const mention   = discordId ? `<@${discordId}>` : 'Unknown player';

			return `**${name}** (${mention}) — ${className}, ${species}, Level ${level}`;
		});

		const embed = new EmbedBuilder()
			.setColor(0x5865f2)
			.setTitle(`📜 ${adventureName}`)
			.addFields(
				{ name: 'Quest ID', value: questId.toUpperCase(), inline: true },
				{ name: 'Date', value: date, inline: true },
				{ name: 'Status', value: status, inline: true },
				...(tier ? [{ name: 'Tier', value: tier, inline: true }] : []),
				{ name: `Allies (${rosterLines.length})`, value: rosterLines.join('\n') || 'None' },
			)
			.setTimestamp();

		if (notes) embed.setDescription(notes);

		return interaction.editReply({ embeds: [embed] });
	}

	const character = await resolveTargetCharacter(interaction);
	if (!character) {
		return interaction.editReply({ content: '❌ Could not find that character.' });
	}

	const charName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
	const entries   = await getCharacterQuestLog(character.id);

	if (entries.length === 0) {
		return interaction.editReply({ content: `**${charName}** hasn't been on any quests yet.` });
	}

	const rows = entries.map(quest => ({
		questId:       quest.properties['Quest ID']?.rich_text?.[0]?.plain_text ?? '—',
		adventureName: quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown',
		date:          formatDateIST(quest.properties['Date']?.date?.start),
		status:        quest.properties['Status']?.select?.name ?? 'Unknown',
	}));

	const idWidth     = Math.max(8, ...rows.map(r => r.questId.length));
	const nameWidth   = Math.max(14, ...rows.map(r => r.adventureName.length));
	const dateWidth   = Math.max(9, ...rows.map(r => r.date.length));

	const header = `${'Quest ID'.padEnd(idWidth)}  ${'Adventure'.padEnd(nameWidth)}  ${'Date'.padEnd(dateWidth)}  Status`;
	const divider = `${'-'.repeat(idWidth)}  ${'-'.repeat(nameWidth)}  ${'-'.repeat(dateWidth)}  ------`;
	const body = rows.map(r =>
		`${r.questId.padEnd(idWidth)}  ${r.adventureName.padEnd(nameWidth)}  ${r.date.padEnd(dateWidth)}  ${r.status}`
	);

	const table = '```\n' + [header, divider, ...body].join('\n') + '\n```';

	const embed = new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle(`📜 Quest Log — ${charName}`)
		.setDescription(table)
		.setFooter({ text: 'Use /league log quest_id:<id> for details on a specific quest.' })
		.setTimestamp();

	return interaction.editReply({ embeds: [embed] });
}

// ─── /league character status ────────────────────────────────────────────────

async function handleCharacterGroup(interaction) {
	const sub = interaction.options.getSubcommand();
	if (sub === 'status') return changeCharacterStatus(interaction);

	return interaction.reply({ content: 'Unknown subcommand.', flags: 64 });
}

async function changeCharacterStatus(interaction) {
	const characterId = interaction.options.getString('character');
	const newStatus   = interaction.options.getString('new_status');

	let character;
	try {
		character = await getPageById(characterId);
	} catch (err) {
		console.error('[league character status] Notion error fetching character:', err);
		return interaction.reply({ content: '❌ Could not reach the database. Please try again.', flags: 64 });
	}

	const ownerDiscordId = character?.properties?.['Discord ID']?.rich_text?.[0]?.plain_text ?? null;
	if (!character || ownerDiscordId !== interaction.user.id) {
		return interaction.reply({ content: '❌ That character was not found among your own characters.', flags: 64 });
	}

	const characterName  = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
	const currentStatus  = character.properties['Status']?.select?.name ?? 'Unknown';

	if (currentStatus === newStatus) {
		return interaction.reply({ content: `**${characterName}** is already **${newStatus}**.`, flags: 64 });
	}

	let warningLine = '';
	if (newStatus === 'Active') {
		let currentlyActive;
		try {
			currentlyActive = await getActiveCharacter(interaction.user.id);
		} catch (err) {
			console.error('[league character status] Notion error checking active character:', err);
			return interaction.reply({ content: '❌ Could not reach the database. Please try again.', flags: 64 });
		}
		if (currentlyActive && currentlyActive.id !== character.id) {
			const otherName = currentlyActive.properties['Character Name']?.title?.[0]?.plain_text ?? 'your other character';
			warningLine = `\n\nSince you can only have one active character, **${otherName}** will be moved to **Passive**.`;
		}
	}

	const embed = new EmbedBuilder()
		.setColor(0x5865f2)
		.setTitle('Confirm Status Change')
		.setDescription(`**${characterName}**: \`${currentStatus}\` → \`${newStatus}\`${warningLine}`);

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`charstatus_confirm:${character.id}:${newStatus}`)
			.setLabel('Confirm')
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setCustomId(`charstatus_cancel:${character.id}`)
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary),
	);

	return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

async function characterOwnAutocomplete(interaction) {
	const focused = interaction.options.getFocused().toLowerCase();

	let characters;
	try {
		characters = await getCharactersByDiscordId(interaction.user.id);
	} catch (err) {
		console.error('[league character status] Autocomplete Notion error:', err);
		return interaction.respond([]);
	}

	const choices = characters
		.filter(c => (c.properties['Character Name']?.title?.[0]?.plain_text ?? '').toLowerCase().includes(focused))
		.slice(0, 25)
		.map(c => ({
			name: `${c.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown'} (${c.properties['Status']?.select?.name ?? 'Unknown'})`,
			value: c.id,
		}));

	await interaction.respond(choices);
}

async function characterLogAutocomplete(interaction) {
	const targetUser = interaction.options.getUser('player');
	const focused     = interaction.options.getFocused().toLowerCase();

	const characters = targetUser
		? await getCharactersByDiscordId(targetUser.id)
		: await searchCharactersByName(focused);

	const filtered = targetUser
		? characters.filter(c => (c.properties['Character Name']?.title?.[0]?.plain_text ?? '').toLowerCase().includes(focused))
		: characters;

	const choices = filtered
		.slice(0, 25)
		.map(c => ({
			name: `${c.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown'} (${c.properties['Status']?.select?.name ?? 'Unknown'})`,
			value: c.id,
		}));

	await interaction.respond(choices);
}

module.exports = { league, characterLogAutocomplete, characterOwnAutocomplete, buildLeaderboardEmbedAndRow, LEADERBOARD_PAGE_SIZE, showBalance };
