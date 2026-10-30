const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter, getCharacterQuestLog, getPageById } = require('../../../utils/leagueNotion');
const { getQuestById } = require('../../leagueQuest');

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

module.exports = {
    showQuestLog,
};
