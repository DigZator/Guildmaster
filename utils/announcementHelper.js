const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { sessions, timeouts } = require('./sessionStore');

const DIFFICULTY_COLORS = {
    'Newbies': 0x5DADEC,
    'Beginners': 0x52BE80,
    'Intermediates': 0xF1C40F,
    'Veterans': 0xE74C3C
};

const MAX_MESSAGE_LENGTH = 2000;
const CHUNK_SIZE = 1900; // margin for triple grave
const EMBED_FIELD_LIMIT = 1024;
const EMBED_TOTAL_LIMIT = 6000;
const EMBED_FIELD_COUNT_LIMIT = 25;
const SESSION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REGISTRATION_LINK = 'https://adventuringguildmumbai.fillout.com/player-sign-up';

const SESSION_GONE_MESSAGE = '❌ This session has expired or was already handled.';
const STALE_PREVIEW_MESSAGE = '⚠️ This preview is outdated — a newer announcement session replaced it. Use the newest preview.';

const REQUIRED_FIELDS = [
    ['title', 'Title'],
    ['date', 'Date'],
    ['time', 'Time'],
    ['blurb', 'Blurb'],
    ['rline', 'Register Line'],
];

function splitLongLine(line, max) {
    if (line.length <= max) return [line];

    const pieces = [];
    let rest = line;
    while (rest.length > max) {
        let cut = rest.lastIndexOf(' ', max);
        if (cut <= 0) cut = max;
        pieces.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
    }
    if (rest) pieces.push(rest);
    return pieces;
}

function chunkLines(lines, max = EMBED_FIELD_LIMIT) {
    const chunks = [];
    let current = [];
    let currentLength = 0;

    for (const line of lines.flatMap(l => splitLongLine(l, max))) {
        const lineLength = line.length + 1;

        if (currentLength + lineLength > max && current.length > 0) {
            chunks.push(current.join('\n'));
            current = [];
            currentLength = 0;
        }
        current.push(line);
        currentLength += lineLength;
    }
    if (current.length > 0) chunks.push(current.join('\n'));

    return chunks.filter(chunk => chunk.trim());
}

async function sendChunkedText(send, text, { prefix = '', embed = null, components = null } = {}) {
    const extras = {};
    if (embed) extras.embeds = [embed];
    if (components) extras.components = components;

    const full = `${prefix}\`\`\`\n${text}\n\`\`\``;
    if (full.length <= MAX_MESSAGE_LENGTH) {
        return send({ content: full, ...extras });
    }

    const first = await send({ content: prefix || null, ...extras });

    const lines = text.split('\n').flatMap(line => splitLongLine(line, CHUNK_SIZE));
    let chunk = '';
    for (const line of lines) {
        if ((chunk + '\n' + line).length > CHUNK_SIZE && chunk.length > 0) {
            await send({ content: `\`\`\`\n${chunk}\n\`\`\`` });
            chunk = line;
        } else {
            chunk = chunk ? chunk + '\n' + line : line;
        }
    }
    if (chunk) await send({ content: `\`\`\`\n${chunk}\n\`\`\`` });

    return first;
}

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

// ── Display values ──────────────────────────────────────────────────────────
function formatLevel(level) {
    if (level === null || level === undefined || level === '') return '-';
    return Number(level) === 0 ? 'N/A' : String(level);
}

function formatCost(price) {
    if (price === 'Free') return 'FREE';
    if (price === 'Paid (Transport Fee only)') return 'Transport Fee';
    return price || '-';
}

function unwrapItalics(text) {
    return text.replace(/^_([^_]+)_$/, '$1');
}

function formatBlurbLines(blurb, max = Infinity) {
    return (blurb ?? '').split('\n').flatMap(line => {
        const text = line.trim();
        if (!text) return [''];
        return splitLongLine(unwrapItalics(text), max).map(piece => `_${piece}_`);
    });
}

function getNoteLines(game) {
    const clean = line => `- ${line.trim().replace(/^[-•]\s*/, '')}`;

    const structured = [
        game.tone,
        game.tableExpect,
        game.expDetailed,
        game.addRestrict,
    ].filter(Boolean).map(clean);

    const freeform = (game.notes ?? '')
        .split('\n')
        .filter(line => line.trim())
        .map(clean);

    return [...structured, ...freeform];
}

// The stored registration line uses Discord markdown (e.g. "**!! text !!**").
// WhatsApp bolds with a single "*" and we want the double-bang emoji, so convert
// at output time only. Stored values, the Discord embed and the default-line
// constants are left alone so the custom-link logic in registrationDefaults.js
// (which compares the stored string) keeps working.
function toWhatsAppRegistrationLine(line) {
    return String(line ?? '')
        .replace(/\*{2,}/g, '*')
        .replace(/!!/g, '‼️');
}

function getDisplay(game) {
    const registrationLink = game.registrationLink || DEFAULT_REGISTRATION_LINK;

    return {
        title: (game.title ?? '').trim() || 'Untitled',
        sessionTypeLabel: `${game.format ?? ''} ${game.type ?? ''}`.trim() || 'TBD',
        experienceLevel: game.experienceLevel || 'N/A',
        date: game.date || 'TBD',
        time: game.time || 'TBD',
        warnings: game.warnings || 'None',
        dm: game.dm || '-',
        system: game.system || '-',
        level: formatLevel(game.level),
        classes: game.classes || '-',
        species: game.species || '-',
        venue: game.location || 'TBD',
        cost: formatCost(game.price),
        artist: game.artist || 'N/A',
        registration: [game.rline, registrationLink].filter(Boolean).join('\n'),
        registrationWhatsApp: [toWhatsAppRegistrationLine(game.rline), registrationLink].filter(Boolean).join('\n'),
        noteLines: getNoteLines(game),
    };
}

function buildAnnouncementEmbed(game, guild, opts = {}) {
    const d = getDisplay(game);
    const color = DIFFICULTY_COLORS[game.experienceLevel] ?? 0x5865F2;

    const section1 = [
        `**${d.sessionTypeLabel}** for *${d.experienceLevel}*`,
        `**${d.date}**`,
        `**${d.time}**`,
        ``,
        ...formatBlurbLines(game.blurb, EMBED_FIELD_LIMIT - 2)
    ];

    const section2 = [
        `**Content Warnings:** ${d.warnings}`,
        ``,
        `**DM:** ${d.dm}`,
        `**System:** ${d.system}`,
        `**Level:** ${d.level}`,
        `**Classes Allowed:** ${d.classes}`,
        `**Species Allowed:** ${d.species}`,
    ];

    const section3 = [`**Other Notes:**`, ...(d.noteLines.length ? d.noteLines : ['-'])];

    const section4 = [
        `**Session Type:** ${d.sessionTypeLabel}`,
        `**Venue:** ${d.venue}`,
        `**Cost:** ${d.cost}`,
        `**Date:** ${d.date}`,
        `**Time:** ${d.time}`,
    ];
    if (opts.showSeats) {
        section4.push(`**Seats:** ${game.openSeats ?? 'N/A'} remaining`);
    }

    const fields = [
        ...chunkLines(section1),
        ...chunkLines(section2),
        ...chunkLines(section3),
        ...chunkLines(section4),
        ...chunkLines(d.registration.split('\n')),
    ].map(value => ({ name: '\u200B', value, inline: false }));

    const embed = new EmbedBuilder()
        .setTitle(d.title.slice(0, 256))
        .setColor(color)
        .addFields(fields)
        .setFooter({ text: `Art: ${d.artist}` });

    if (game.artURL) embed.setImage(game.artURL);

    return embed;
}

function buildWhatsApp(game) {
    const d = getDisplay(game);

    return `*${d.title}*
_${d.sessionTypeLabel}_ for *${d.experienceLevel}*
*${d.date}*
*${d.time}*

${formatBlurbLines(game.blurb).join('\n')}

*CW:* ${d.warnings}
*DM:* ${d.dm}
*System:* ${d.system}
*Level:* ${d.level}
*Classes Allowed:* ${d.classes}
*Species Allowed:* ${d.species}

*Other Notes:*
${d.noteLines.join('\n') || '-'}

*Session Type:* ${d.sessionTypeLabel}
*Venue:* ${d.venue}
*Cost:* ${d.cost}
*Date:* ${d.date}
*Time:* ${d.time}

*Art Credits:* _${d.artist}_

${d.registrationWhatsApp}`;
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
    return formatBlurbLines(text).join('\n');
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

// ── Preview checks ──────────────────────────────────────────────────────────
function getEmbedSize(embed) {
    const data = embed.toJSON();
    return (data.title?.length ?? 0)
        + (data.description?.length ?? 0)
        + (data.footer?.text.length ?? 0)
        + (data.fields ?? []).reduce((total, f) => total + f.name.length + f.value.length, 0);
}

function getPreviewWarnings(game, embed = null) {
    const lines = [];

    if (!game.artURL) {
        lines.push('⚠️ **No cover art found for this game.** Please upload an image via the Edit menu before confirming.');
    }

    const missing = REQUIRED_FIELDS
        .filter(([key]) => !String(game[key] ?? '').trim())
        .map(([, label]) => label);
    if (missing.length) {
        lines.push(`⚠️ **Missing fields:** ${missing.join(', ')}. Use Edit to fill them in.`);
    }

    if (game.show) {
        lines.push('ℹ️ This game is already marked as announced (Show is ticked in Notion).');
    }

    if (embed) {
        const size = getEmbedSize(embed);
        const fieldCount = embed.data.fields?.length ?? 0;
        if (size > EMBED_TOTAL_LIMIT || fieldCount > EMBED_FIELD_COUNT_LIMIT) {
            lines.push(`⚠️ **This announcement is too long to post** (${size}/${EMBED_TOTAL_LIMIT} characters, ${fieldCount}/${EMBED_FIELD_COUNT_LIMIT} fields). Shorten a field via Edit before confirming.`);
        }
    }

    return lines.length ? `${lines.join('\n')}\n\n` : '';
}

// ── Sessions ────────────────────────────────────────────────────────────────
function setSessionTimeout(userId, ms = SESSION_TTL_MS) {
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

function restoreSession(userId, session) {
    if (sessions.has(userId)) return false;
    sessions.set(userId, session);
    setSessionTimeout(userId);
    return true;
}

function isCurrentPreview(session, interaction) {
    if (!session.previewMessageId || !interaction.message) return true;
    return session.previewMessageId === interaction.message.id;
}

module.exports = {
    SESSION_TYPE_ROLES,
    SESSION_GONE_MESSAGE,
    STALE_PREVIEW_MESSAGE,
    buildAnnouncementEmbed,
    buildWhatsApp,
    toWhatsAppRegistrationLine,
    sendChunkedText,
    getRoleMention,
    getPreviewButtons,
    getPreviewWarnings,
    italizeBlurb,
    bulletizeNotes,
    setSessionTimeout,
    clearSessionTimeout,
    restoreSession,
    isCurrentPreview
};
