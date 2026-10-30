const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getActiveCharacter, getPageById } = require('../../../utils/leagueNotion');

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

module.exports = {
    changeCharacterStatus,
};
