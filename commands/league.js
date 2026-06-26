const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter, updateCharacterArt, updatePageProperty } = require('../utils/leagueNotion');
const { buildLeagueCreateModal } = require('../modals/leagueCreate');
const { sendInventory } = require('../buttons/inventory')
const { sendItemDetail } = require('../utils/inventoryHelper')

async function league(interaction, client) {
	  const sub = interaction.options.getSubcommand();

	  switch (sub) {
		    case 'create':
		      	return handleCreate(interaction);

		    case 'profile':
		    	return showProfile(interaction);

			case 'edit':
				return editCharacter(interaction);
				
		    case 'setart':
		    	return setCharacterArt(interaction);
		    	
		    case 'inv':
				return sendInventory(interaction);

			case 'item':
				return sendItemDetail(interaction);

		    case 'shop':	
				

		    case 'marketplace':
			

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
	  const forumId = process.env.LEAGUE_PROFILES_FORUM_ID;

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

	  //    Check the player doesn't already have an Active character.
	  //    Defer the check behind an ephemeral deferral so we have time to query Notion
	  //    before opening the modal (modals must be shown within 3 s of the interaction).
	  //
	  //    Strategy: query Notion first synchronously (within the 3 s window),
	  //    then show the modal or reply with an error.
	  //
	  //    Notion reads are fast (< 1 s on a healthy connection), so this is safe.
	  //    If latency ever becomes an issue, pre-validate via a button flow instead.

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

	  // 3. Open the registration modal.
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

async function setCharacterArt(interaction) {
	const channel = interaction.channel;
	const isThread = channel?.isThread?.();
	const parentId = channel?.parentId;

	if (!isThread || parentId !== process.env.LEAGUE_PROFILES_FORUM_ID){
		return interaction.reply({
			content: 'You need to run `/league setart` inside your character profile thread in the **#characters** forum.',
			flags: 64,
		});
	}
	
    await interaction.deferReply({ flags: 64 });

    let character;
    try {
        character = await getActiveCharacter(interaction.user.id);
    } catch (err) {
        console.error('[setart] Notion error fetching character:', err);
        return interaction.editReply({ content: 'Could not reach the database. Please try again.' });
    }

    if (!character) {
        return interaction.editReply({
            content: 'You do not have an active character. Use `/league create` to register one.',
        });
    }

    const attachment = interaction.options.getAttachment('image');

    if (!attachment.contentType?.startsWith('image/')) {
        return interaction.editReply({ content: '❌ That file doesn\'t look like an image. Please upload a PNG, JPG, or GIF.' });
    }

    try {
        await updateCharacterArt(character.id, attachment.url);
    } catch (err) {
        console.error('[setart] Notion error updating art:', err);
        return interaction.editReply({ content: 'Failed to save your art. Please try again.' });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'your character';

    return interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Character Art Updated')
                .setDescription([
                    `**${characterName}'s** profile art has been saved.`,
                    '',
                    '⚠️ **Do not delete the message containing this image** — Discord uses it to display your art. If lost, rerun `/league setart`.',
                    '',
                    '🎨 **Reminder:** AI-generated artwork is not permitted.',
                ].join('\n'))
                .setThumbnail(attachment.url),
        ],
    });
}

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

    const adminChannelId = process.env.LEAGUE_ADMIN_CHANNEL_ID;
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
        console.warn('[edit] Admin log channel not found — ADMIN_LOG_CHANNEL_ID may not be set.');
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

module.exports = { league };
