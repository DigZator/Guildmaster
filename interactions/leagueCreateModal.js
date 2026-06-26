const { EmbedBuilder } = require('discord.js');
const { createCharacter } = require('../utils/leagueNotion');

async function handleLeagueCreate(interaction, client) {
	  const characterName = interaction.fields.getTextInputValue('characterName').trim();
	  const classLevels   = interaction.fields.getTextInputValue('classLevels').trim();
	  const species       = interaction.fields.getTextInputValue('species').trim();
	  const background    = interaction.fields.getTextInputValue('background').trim();

	  const discordId       = interaction.user.id;
	  const discordUsername = interaction.user.tag;
	  const forumThreadId   = interaction.channelId;

	  await interaction.deferReply({ ephemeral: true });

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

	  const adminChannelId = process.env.LEAGUE_ADMIN_CHANNEL_ID;
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
