const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { sessions, timeouts } = require('./sessionStore');

const DIFFICULTY_COLORS = {
    'Newbies': 0x5DADEC,
    'Beginners': 0x52BE80,
    'Intermediates': 0xF1C40F,
    'Veterans': 0xE74C3C
};

const SESSION_TYPE_ROLES = {
    'In-Person One-Shot': 'In-Person One-Shots',
    'In-Person Mini-Adventure': 'In-Person Mini-Adventures',
    'In-Person Campaign': 'In-Person Campaigns',
    'In-Person Workshop': 'Workshops',
    'Online One-Shot': 'Online One-Shots',
    'Online Mini-Adventure': 'Online Mini-Adventures',
    'Online Campaign': 'Online Campaigns',
    'Online Workshop': 'Workshops',
    'Play-By-Post One-Shot': 'Play-By-Post One-Shots',
    'Play-By-Post Mini-Adventure': 'Play-By-Post Mini-Adventures',
    'Play-By-Post Campaign': 'Play-By-Post Campaigns'
};

function buildAnnouncementEmbed(game, guild, opts = {}) {
    const color = DIFFICULTY_COLORS[game.experienceLevel] ?? 0x5865F2;
    const sessionTypeLabel = `${game.format} ${game.type}`;

    const formattedBlurb = game.blurb
        .split('\n')
        .map(line => line.trim() ? `_${line.trim()}_` : '')
        .join('\n');

    const section1 = [
        `**${sessionTypeLabel}** for *${game.experienceLevel}*`,
        `**${game.date}**`,
        `**${game.time}**`,
        ``,
        formattedBlurb
    ].join('\n');

    const section2 = [
        `**Content Warnings:** ${game.warnings || 'None'}`,
        ``,
        `**DM:** ${game.dm || '-'}`,
        `**System:** ${game.system || '-'}`,
        `**Level:** ${game.level === '0' ? 'N/A' : game.level}`,
        `**Classes Allowed:** ${game.classes || '-'}`,
        `**Species Allowed:** ${game.species || '-'}`,
    ].join('\n');

    const section3Parts = [`**Other Notes:**`];
	const structuredNotes = [
		game.tone,
		game.tableExpect,
		game.expDetailed,
		game.addRestrict,
	].filter(Boolean);

	structuredNotes.forEach(line => {
		section3Parts.push(`- ${line.trim().replace(/^[-•]\s*/, '')}`);
	})
    if (game.notes) {
        game.notes.split('\n').forEach(line => {
            if (line.trim()) {
                const cleaned = line.trim().replace(/^[-•]\s*/, '');
                section3Parts.push(`- ${cleaned}`);
            }
        });
    } else if (!structuredNotes.length){
        section3Parts.push('-');
    }

    const noteFields=[];
    let current = [];
    let currentLength = 0;

    for (const line of section3Parts) {
    	const lineLenght = line.length + 1;

    	if (currentLength + lineLenght > 1024 && current.length>0) {
    		noteFields.push(current.join('\n'));
    		current = [];
    		currentLength = 0;
    	}
    	current.push(line);
    	currentLength += lineLenght; 
    }
    if (current.length > 0) noteFields.push(current.join('\n'));

    const section4Parts = [
        `**Session Type:** ${sessionTypeLabel}`,
        `**Venue:** ${game.location || 'TBD'}`,
        `**Cost:** ${game.price === 'Free' ? 'FREE' : game.price === 'Paid (Transport Fee only)' ? 'Transport Fee' : game.price}`,
        `**Date:** ${game.date}`,
        `**Time:** ${game.time}`,
    ];
    if (opts.showSeats) {
    	const seats = game.openSeats != undefined ? game.openSeats : 'N/A';
    	section4Parts.push(`**Seats:** ${seats} remaining`);
    }

    const registrationLink = game.registrationLink || 'https://adventuringguildmumbai.fillout.com/player-sign-up';
    const section5 = `${game.rline}\n${registrationLink}`;

    const embed = new EmbedBuilder()
        .setTitle(game.title.trim())
        .setColor(color)
        .addFields(
            { name: '\u200B', value: section1, inline: false },
            { name: '\u200B', value: section2, inline: false },
            ...noteFields.map(chunk => ({ name: '\u200B', value: chunk, inline: false })),
            { name: '\u200B', value: section4Parts.join('\n'), inline: false },
            { name: '\u200B', value: section5, inline: false },
        )
        .setFooter({ text: `Art: ${game.artist || 'N/A'}` });

    if (game.artURL) embed.setImage(game.artURL);

    return embed;
}

function buildWhatsApp(game) {
    const sessionTypeLabel = `${game.format} ${game.type}`;
    const registrationLink = game.registrationLink || 'https://adventuringguildmumbai.fillout.com/player-sign-up';
	const structuredNotes = [
		game.tone,
		game.tableExpect,
		game.expDetailed,
		game.addRestrict,
	].filter(Boolean).map(line => `- ${line.trim().replace(/^[-•]\s*/, '')}`);

	const freeformNotes = game.notes
		? game.notes.split('\n')
			.filter(line => line.trim())
			.map(line => `- ${line.trim().replace(/^[-•]\s*/, '')}`)
		: [];
	
    const notesLines = [...structuredNotes, ...freeformNotes].join('\n') || '-';

    return `*${game.title.trim()}*
_${sessionTypeLabel}_ for *${game.experienceLevel}*
*${game.date}*
*${game.time}*

${game.blurb.split('\n').map(line => line.trim() ? `_${line.trim()}_` : '').join('\n')}

*CW:* ${game.warnings || 'None'}
*DM:* ${game.dm || '-'}
*System:* ${game.system || '-'}
*Level:* ${game.level === '0' ? 'N/A' : game.level}
*Classes Allowed:* ${game.classes || '-'}
*Species Allowed:* ${game.species || '-'}

*Other Notes:*
${notesLines}

*Session Type:* ${sessionTypeLabel}
*Venue:* ${game.location || 'TBD'}
*Cost:* ${game.price === 'Free' ? 'FREE' : game.price === 'Paid (Transport Fee only)' ? 'Transport Fee' : game.price}
*Date:* ${game.date}
*Time:* ${game.time}

*Art Credits:* _${game.artist || 'N/A'}_

${game.rline}
${registrationLink}`;
}

function getRoleMention(game, guild) {
    const sessionTypeLabel = `${game.format} ${game.type}`;
    const roleName = SESSION_TYPE_ROLES[sessionTypeLabel];
    if (!roleName) return '';
    const role = guild.roles.cache.find(r => r.name === roleName);
    return role ? `<@&${role.id}>` : '';
}

function getPreviewButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('announce_confirm')
            .setLabel('Confirm & Post')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('announce_edit')
            .setLabel('Edit')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('announce_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
    );
}

function italizeBlurb(text) {
    return text.split('\n')
        .map(line => line.trim() ? `_${line.trim()}_` : '')
        .join('\n');
}

function bulletizeNotes(text) {
    return text.split('\n')
        .filter(line => line.trim())
        .map(line => {
            const cleaned = line.trim().replace(/^[-•*]\s*/, '');
            return `- ${cleaned}`;
        })
        .join('\n');
}

function setSessionTimeout(userId, ms = 120000) {
    if (timeouts.get(userId)) {
    	clearTimeout(timeouts.get(userId));
    }
    const timeout = setTimeout(() => {
    	sessions.delete(userId);
    	timeouts.delete(userId);
    }, ms);
    timeouts.set(userId, timeout);
}

function clearSessionTimeout(userId) {
    if (timeouts.get(userId)) {
        clearTimeout(timeouts.get(userId));
        timeouts.delete(userId);
    }
}

module.exports = {
	SESSION_TYPE_ROLES,
    buildAnnouncementEmbed,
    buildWhatsApp,
    getRoleMention,
    getPreviewButtons,
    italizeBlurb,
    bulletizeNotes,
    setSessionTimeout,
    clearSessionTimeout
};
