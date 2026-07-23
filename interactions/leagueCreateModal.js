const { EmbedBuilder } = require('discord.js');
const { createCharacter, getActiveCharacter, createInventoryItem } = require('../utils/leagueNotion');
const { getCatalogueItemByName, defaultPriceFor } = require('../utils/5etoolsCatalogue');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

const LEAGUE_PLAYERS_ROLE_ID = process.env.LEAGUE_PLAYERS_ROLE_ID;
const STARTER_POTION_NAME = 'Potion of Healing';

function isValidInput(input) {
	try {
		const parts = input.split(",").map(s => s.trim());

		if (parts.length !== 6) return false;
		const numbers = parts.map(Number);
		if (numbers.some(Number.isNaN)) return false;

		const pb = {
			8: 	0,
			9: 	1,
			10: 2,
			11: 3,
			12: 4,
			13: 5,
			14: 7,
			15: 9,
		};
		
		const sum = numbers.reduce((sum, score) => {
			return sum + (pb[score] ?? 0);
		}, 0);

		return sum === 27;
	} catch (err) {
		return false;
	}
}

async function handleLeagueCreate(interaction, client) {
	  const characterName = interaction.fields.getTextInputValue('characterName').trim();
	  const classLevels   = interaction.fields.getTextInputValue('classLevels').trim();
	  const species       = interaction.fields.getTextInputValue('species').trim();
	  const background    = interaction.fields.getTextInputValue('background').trim();
	  const scores 		  = interaction.fields.getTextInputValue('scores').trim();

	  const discordId       = interaction.user.id;
	  const discordUsername = interaction.user.tag;
	  const forumThreadId   = interaction.channelId;

	  await interaction.deferReply({ flags : 64 });

	  if (!isValidInput(scores)) {
	  	return interaction.editReply({
	  		content: 'You entered an incorrect ability score array. Please ensure the **6** sccores are comma(,) separated, and add up to 72.'
	  	});
	  }
	  
	  let existingCharacter;
	  try {
		    existingCharacter = await getActiveCharacter(discordId);
	  } catch (err) {
		    console.error('[leagueCreate modal] Notion error during re-check:', err);
		    return interaction.editReply({
			      content: 'Could not reach the database right now. Please try again in a moment.',
		    });
	  }

	  if (existingCharacter) {
		    const existingName = existingCharacter.properties['Character Name']?.title?.[0]?.plain_text ?? 'your character';
		    return interaction.editReply({
			      content: `You already have an active character: **${existingName}**. You can only register a new character after your current one is retired or deceased.`,
		    });
	  }

	  let characterPage;
	  try {
		    characterPage = await createCharacter({
			      characterName,
			      classLevels,
			      species,
			      background,
			      discordId,
			      discordUsername,
			      forumThreadId,
		    });
	  } catch (err) {
		    console.error('[leagueCreate modal] Notion write error:', err);
			    return interaction.editReply({
			      	content: 'Something went wrong saving your character. Please ping an admin.',
		    });
	  }

	  // ── Grant @League Players role ────────────────────────────────────────────
	  let roleWarning = null;
	  if (!LEAGUE_PLAYERS_ROLE_ID) {
		    console.warn('[leagueCreate modal] LEAGUE_PLAYERS_ROLE_ID not set — skipping role grant.');
		    roleWarning = 'LEAGUE_PLAYERS_ROLE_ID is not configured.';
	  } else {
		    try {
			      await interaction.member.roles.add(LEAGUE_PLAYERS_ROLE_ID);
		    } catch (err) {
			      console.error('[leagueCreate modal] Failed to grant League Players role:', err);
			      roleWarning = `Could not grant the role automatically (${err.message}).`;
		    }
	  }

	  // ── Grant starting Potion of Healing ──────────────────────────────────────
	  let potionWarning = null;
	  try {
		    const potionItem = getCatalogueItemByName(STARTER_POTION_NAME);
		    await createInventoryItem({
			      itemName: STARTER_POTION_NAME,
			      characterPageId: characterPage.id,
			      rarity: potionItem?.rarity ?? 'Common',
			      type: potionItem?.type ?? 'Potion',
			      itemValue: potionItem?.priceGp ?? defaultPriceFor('Common'),
			      source: 'Character Creation',
			      status: 'Owned',
		    });
		    if (!potionItem) {
			      console.warn(`[leagueCreate modal] "${STARTER_POTION_NAME}" not found in catalogue — added with fallback Common values.`);
		    }
	  } catch (err) {
		    console.error('[leagueCreate modal] Failed to grant starting potion:', err);
		    potionWarning = `Could not add the starting potion automatically (${err.message}).`;
	  }

	  const confirmEmbed = new EmbedBuilder()
	    .setColor(0x5865f2) // Discord blurple
	    .setTitle('⚔️ Character Registered!')
	    .setDescription(
	      `Welcome to the Adventurer's League, **${characterName}**! Your character has been recorded.`
	    )
	    .addFields(
	      { name: 'Class', 		   value: classLevels, inline: true },
	      { name: 'Species',       value: species,     inline: true },
	      { name: 'Background',    value: background,  inline: true },
	    )
	    .setFooter({ text: `Registered by ${discordUsername}` })
	    .setTimestamp();

	  await interaction.editReply({ embeds: [confirmEmbed] });

	  try {
	    	await interaction.channel.send({ embeds: [confirmEmbed] });
	  } catch (err) {
	    	console.error('[leagueCreate modal] Could not send public thread message:', err);
	  }

	  // ── Ping admin in #league-admin ───────────────────────────────────────────

	  const adminChannelId = LEAGUE_ADMIN_CHANNEL_ID;
	  if (!adminChannelId) {
		    console.warn('[leagueCreate modal] LEAGUE_ADMIN_CHANNEL_ID not set — skipping admin ping.');
		    return;
	  }

	  try {
		    const adminChannel = await client.channels.fetch(adminChannelId);
			    if (!adminChannel?.isTextBased()) return;

			    const adminEmbed = new EmbedBuilder()
				      .setColor(0xfee75c) // Yellow for visibility
				      .setTitle('📋 New Character Registration')
				      .addFields(
				        { name: 'Character',    value: characterName,              inline: true },
				        { name: 'Class',		value: classLevels,                inline: true },
				        { name: 'Species',      value: species,                    inline: true },
				        { name: 'Background',   value: background,                 inline: true },
				        { name: 'Player',       value: `<@${discordId}> (${discordUsername})`, inline: false },
				        { name: 'Thread',       value: `<#${forumThreadId}>`,      inline: false },
				        { name: 'Notion Page',  value: characterPage.url ?? '(unknown)', inline: false },
				        ...(roleWarning ? [{ name: '⚠️ Role grant', value: roleWarning, inline: false }] : []),
				        ...(potionWarning ? [{ name: '⚠️ Starting potion', value: potionWarning, inline: false }] : []),
				      )
				      .setTimestamp();

			    await adminChannel.send({
				      content: '🆕 A new character has been registered for review.',
				      embeds: [adminEmbed],
		    });
	  } catch (err) {
	    	console.error('[leagueCreate modal] Could not send admin notification:', err);
	  }
}

module.exports = { handleLeagueCreate };
