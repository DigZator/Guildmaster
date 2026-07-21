const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter, updateCharacterArt, updatePageProperty, getCharacterGold, setCharacterGold } = require('../utils/leagueNotion');
const { buildLeagueCreateModal } = require('../modals/leagueCreate');
const { sendInventory } = require('../buttons/inventory');
const { sendItemDetail } = require('../utils/inventoryHelper');
const { LEAGUE_ADMIN_CHANNEL_ID, LEAGUE_ART_ARCHIVE_THREAD_ID, LEAGUE_PROFILES_FORUM_ID } = require('../data/channels');
const { leagueShop, leagueMarketplace } = require('./leagueShop');
const { listQuests } = require('./leagueQuest');
const { leagueDowntime } = require('./leagueDowntime');
const { leagueStarterItems } = require('./leagueStarterItems');
const { formatCurrency } = require('../utils/currency');

const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB

async function league(interaction, client) {
	const group = interaction.options.getSubcommandGroup(false);
	const sub = interaction.options.getSubcommand();

	if (group === 'shop') return leagueShop(interaction);
	if (group === 'marketplace') return leagueMarketplace(interaction);
	if (group === 'downtime') return leagueDowntime(interaction);
	if (group === 'quest') return handleQuestGroup(interaction);
	
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
			return interaction.reply({
				content: `The \`/league ${sub}\` command is coming soon!`,
				flags: 64,
			});

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
    const background    = interaction.options.getString('background');
    const charSheetLink = interaction.options.getString('charsheetlink');

    if (!name && !classLevels && !background && !charSheetLink) {
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
    const amount     = interaction.options.getInteger('amount');

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
    try {
        [senderGold, receiverGold] = await Promise.all([
            getCharacterGold(senderChar.id),
            getCharacterGold(receiverChar.id),
        ]);
    } catch (err) {
        console.error('[gold] Notion error fetching gold:', err);
        return interaction.editReply({ content: '❌ Could not read gold balances. Please try again.' });
    }

    if (senderGold < amount) {
        return interaction.editReply({
            content: `❌ You do not have enough gold. Current balance: **${formatCurrency(senderGold)}**.`,
        });
    }

    const newSenderGold   = senderGold   - amount;
    const newReceiverGold = receiverGold + amount;

    try {
        await Promise.all([
            setCharacterGold(senderChar.id,   newSenderGold),
            setCharacterGold(receiverChar.id, newReceiverGold),
        ]);
    } catch (err) {
        console.error('[gold] Notion error during transfer:', err);

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
                        .setDescription('A gold transfer failed mid-execution. Manual review may be required.')
                        .addFields(
                            { name: 'Sender',               value: `<@${interaction.user.id}> (${senderName})`,  inline: true },
                            { name: 'Receiver',             value: `<@${targetUser.id}> (${receiverName})`,      inline: true },
                            { name: 'Amount',               value: `${formatCurrency(amount)}`,                               inline: true },
                            { name: 'Sender Before',        value: `${formatCurrency(senderGold)}`,                           inline: true },
                            { name: 'Receiver Before',      value: `${formatCurrency(receiverGold)}`,                         inline: true },
                            { name: '\u200b',               value: '\u200b',                                     inline: true },
                            { name: 'Sender After (actual)',   value: `${formatCurrency(actualSenderGold)}`,                  inline: true },
                            { name: 'Receiver After (actual)', value: `${formatCurrency(actualReceiverGold)}`,                inline: true },
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

async function handleQuestGroup(interaction) {
	const sub = interaction.options.getSubcommand();
	if (sub === 'list') return listQuests(interaction);
}

module.exports = { league };
