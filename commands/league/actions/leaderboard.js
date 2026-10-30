const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { randomBytes } = require('crypto');
const { queryLeaderboard } = require('../../../utils/leagueNotion');

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

module.exports = {
    LEADERBOARD_PAGE_SIZE,
    buildLeaderboardEmbedAndRow,
    showLeaderboard,
};
