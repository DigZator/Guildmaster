const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter } = require('../utils/leagueNotion');
const { buildLeagueCreateModal } = require('../modals/leagueCreate');

async function league(interaction, client) {
	  const sub = interaction.options.getSubcommand();

	  switch (sub) {
		    case 'create':
		      	return handleCreate(interaction);

		    // ── Stubs for future subcommands ────────────────────────────────────────
		    case 'profile':
		    case 'p':
		    	return showProfile(interaction);
		    case 'inventory':
			case 'i':
			
		    case 'shop':
			case 's':
				
		    case 'marketplace':
			case 'mp':
			
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
	cosnt targetUser = interaction.options.getUser('user') ?? interaction.user;
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

	return interaction.reply({ embeds: [profileEmbed] });
}

module.exports = { league };
