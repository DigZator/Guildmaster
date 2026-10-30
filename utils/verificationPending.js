const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('./verificationStore');
const { getConfig } = require('../config/verificationConfig');
const { deadlineOf } = require('./verificationService');

const PAGE_SIZE = 15;
const PAGER_PREFIX = 'verification:pending:';

function buildPendingPage(page = 0) {
    const cfg = getConfig();
    const now = Date.now();
    const rows = Object.entries(store.all())
        .filter(([, e]) => e.trackedSince)
        .map(([id, e]) => ({ id, e, deadline: deadlineOf(e, cfg) }))
        .sort((a, b) => a.deadline - b.deadline);

    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, page), pages - 1);

    const lines = rows.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE).map(({ id, e, deadline }) => {
        const sent = [...(e.remindersSent || [])].sort((a, b) => b - a);
        const bits = [
            `${deadline <= now ? '⛔ overdue' : '⏳'} <t:${Math.floor(deadline / 1000)}:R>`,
            sent.length ? `reminders: ${sent.join(', ')}d` : null,
            e.extraDays ? `+${e.extraDays}d extended` : null,
            e.lockedUntil > now ? '🔒 locked' : null,
        ].filter(Boolean);
        return `<@${id}>: ${bits.join(' · ')}`;
    });

    const embed = new EmbedBuilder()
        .setTitle('⏳ Unverified members')
        .setColor(0x5865f2)
        .setDescription(lines.length ? lines.join('\n') : 'Nobody is currently being tracked.')
        .setFooter({
            text: `Page ${p + 1}/${pages} · ${rows.length} tracked · cleanup: ${cfg.cleanupMode}`
                + (cfg.cleanupMode === 'disabled' ? ' (tracking is paused)' : ''),
        });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PAGER_PREFIX}${p - 1}`).setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId(`${PAGER_PREFIX}${p + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(p >= pages - 1),
    );
    return { embeds: [embed], components: pages > 1 ? [row] : [], allowedMentions: { parse: [] } };
}

module.exports = { buildPendingPage, PAGER_PREFIX };
