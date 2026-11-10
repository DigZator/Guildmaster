// Logic for /config status | set | clear: change where the bot sends things without editing .env.
// Saved to data/channelMap.json by utils/channelMap.js and applied at the next start.
// commands/config.js is the thin entry point; buttons/config.js handles the confirm / cancel buttons.
const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { MAPPINGS } = require('../../config/mappings');
const { checkMappings, severity, chunkLines } = require('../../utils/mappingCheck');
const channelMap = require('../../utils/channelMap');

const CONFIRM_TTL_MS = 2 * 60 * 1000;
const RESTART_NOTE = 'This takes effect after the bot restarts.';

// Confirmations waiting for a button press: token -> { userId, key, id, label, expires }
const pending = new Map();
function sweepPending(now = Date.now()) {
    for (const [token, entry] of pending) if (entry.expires <= now) pending.delete(token);
}

const mention = (id) => (id ? `<#${id}>` : '*not set*');
const sourceText = (source) => ({ config: 'set by /config', env: '.env', unset: 'not set' }[source]);
const entryFor = (key) => MAPPINGS.find(m => m.key === key) || null;

// The bot log is the audit trail; fall back to the control channel. Never fails the command.
async function audit(client, embed) {
    const dev = process.env.DEV_MODE === 'true';
    const order = dev
        ? [process.env.BOT_DEBUGGING_CHANNEL_ID, process.env.GUILDMASTER_CTRL_CHANNEL_ID, process.env.BOT_LOG_CHANNEL_ID]
        : [process.env.BOT_LOG_CHANNEL_ID, process.env.GUILDMASTER_CTRL_CHANNEL_ID];
    for (const id of [...new Set(order.filter(Boolean))]) {
        try {
            const channel = await client.channels.fetch(id);
            if (typeof channel?.send !== 'function') continue;
            await channel.send({ embeds: [embed] });
            return true;
        } catch (err) {
            console.warn(`[config] Could not post the audit line to ${id}: ${err.message}`);
        }
    }
    return false;
}

function auditEmbed({ action, entry, before, after, userId }) {
    return new EmbedBuilder()
        .setTitle(`Channel mapping ${action}`)
        .setColor(0x5865F2)
        .addFields(
            { name: 'Mapping', value: `${entry.label} (\`${entry.key}\`)` },
            { name: 'Before', value: before ? mention(before) : '*not set*', inline: true },
            { name: 'After', value: after ? mention(after) : '*not set*', inline: true },
            { name: 'By', value: `<@${userId}>`, inline: true },
        )
        .setFooter({ text: 'Applies after the bot restarts.' })
        .setTimestamp();
}

async function applySet(client, { userId, key, id }) {
    const entry = entryFor(key);
    const before = channelMap.describe(key);
    channelMap.setMapping(key, id, userId);
    await audit(client, auditEmbed({ action: 'set', entry, before: before.next, after: id, userId }));
    return new EmbedBuilder()
        .setTitle('✅ Mapping saved')
        .setColor(0x57F287)
        .setDescription(`**${entry.label}** will use ${mention(id)}.\n${RESTART_NOTE} Until then the bot keeps using ${mention(before.running)}.`)
        .addFields({ name: 'Key', value: `\`${key}\`` });
}

async function handleSet(interaction, client) {
    const key = interaction.options.getString('key');
    const channel = interaction.options.getChannel('channel');
    const refusal = key ? channelMap.refusalFor(key) : 'Pick a mapping from the list.';
    if (refusal) return interaction.reply({ content: `❌ ${refusal}`, flags: 64 });
    if (!channel) return interaction.reply({ content: '❌ Pick a channel.', flags: 64 });

    await interaction.deferReply({ flags: 64 });
    const entry = entryFor(key);

    // Same checks as the startup report, on the channel that was picked: right type, this server, bot permissions.
    const [check] = await checkMappings(client, { mappings: [{ ...entry, read: () => channel.id }] });
    if (check.status === 'unchecked') return interaction.editReply({ content: '❌ Not saved: the server could not be reached to check that channel. Try again in a moment.' });
    if (check.status !== 'ok' && check.status !== 'skipped') {
        return interaction.editReply({ content: `❌ Not saved. **${entry.label}** cannot use <#${channel.id}>: ${check.detail}.` });
    }

    const current = channelMap.describe(key);
    if (current.next === channel.id && !current.pending) {
        return interaction.editReply({ content: `**${entry.label}** already uses ${mention(channel.id)}. Nothing to change.` });
    }

    if (entry.confirm) {
        sweepPending();
        const token = crypto.randomBytes(6).toString('hex');
        pending.set(token, { userId: interaction.user.id, key, id: channel.id, expires: Date.now() + CONFIRM_TTL_MS });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`config:confirm:${token}`).setLabel('Yes, change it').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`config:cancel:${token}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        const embed = new EmbedBuilder()
            .setTitle(`⚠️ Change ${entry.label}?`)
            .setColor(0xFEE75C)
            .setDescription(`${entry.confirm}\n\nYou are about to point it at ${mention(channel.id)}. Check that is the right channel.\nThis expires in 2 minutes.`);
        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    const embed = await applySet(client, { userId: interaction.user.id, key, id: channel.id });
    return interaction.editReply({ embeds: [embed] });
}

async function handleClear(interaction, client) {
    const key = interaction.options.getString('key');
    const refusal = key ? channelMap.refusalFor(key) : 'Pick a mapping from the list.';
    if (refusal) return interaction.reply({ content: `❌ ${refusal}`, flags: 64 });
    const entry = entryFor(key);
    const before = channelMap.describe(key);
    if (!before.saved) {
        return interaction.reply({ content: `**${entry.label}** has no saved override. It uses ${before.runningSource === 'env' ? `the .env value ${mention(before.running)}` : 'nothing (not set)'}.`, flags: 64 });
    }
    channelMap.clearMapping(key);
    const after = channelMap.describe(key);
    await audit(client, auditEmbed({ action: 'cleared', entry, before: before.next, after: after.next, userId: interaction.user.id }));
    const embed = new EmbedBuilder()
        .setTitle('✅ Override removed')
        .setColor(0x57F287)
        .setDescription(`**${entry.label}** goes back to ${after.next ? `the .env value ${mention(after.next)}` : 'not set (there is no .env value)'}.\n${RESTART_NOTE} Until then the bot keeps using ${mention(after.running)}.`)
        .addFields({ name: 'Key', value: `\`${key}\`` });
    return interaction.reply({ embeds: [embed], flags: 64 });
}

const ICONS = { ok: '✅', warn: '⚠️', error: '❌' };

async function handleStatus(interaction, client) {
    await interaction.deferReply({ flags: 64 });
    const results = await checkMappings(client);
    const resultFor = (key) => results.find(r => r.key === key);

    let waiting = 0;
    const lines = MAPPINGS.map((entry) => {
        const result = resultFor(entry.key);
        const icon = !result || ['unchecked', 'skipped'].includes(result.status) ? '➖' : ICONS[severity(result)];
        let text = `${icon} **${entry.label}** (\`${entry.key}\`)\n`;
        if (entry.managed) {
            let id = null;
            try { id = entry.read(); } catch { /* shown as not set */ }
            text += `↳ ${mention(id)} · managed by another command. ${entry.fix}`;
        } else {
            const d = channelMap.describe(entry.key);
            text += `↳ ${mention(d.running)} · ${sourceText(d.runningSource)}`;
            if (entry.gate) text += ' · 🔒 permission gate, .env only';
            if (d.pending) { waiting++; text += `\n↳ ⏳ after restart: ${mention(d.next)} (${sourceText(d.nextSource)})`; }
        }
        if (result && !['ok', 'skipped', 'unchecked'].includes(result.status)) text += `\n↳ ${result.detail}`;
        return text;
    });

    const checked = results.filter(r => !['unchecked', 'skipped'].includes(r.status));
    const healthy = checked.filter(r => r.status === 'ok').length;
    const embed = new EmbedBuilder()
        .setTitle('Channel mappings')
        .setColor(waiting ? 0xFEE75C : 0x5865F2)
        .setDescription(`${healthy} of ${checked.length} checked mappings look good.${waiting ? `\n⏳ ${waiting} saved change(s) will apply after the next restart.` : ''}`)
        .setFooter({ text: '/config set <key> <channel> · /config clear <key>' });
    chunkLines(lines).forEach((value, i) => embed.addFields({ name: i === 0 ? 'Mappings' : 'Mappings (cont.)', value }));
    return interaction.editReply({ embeds: [embed] });
}

// Who is offered keys is enforced by the router (manifests/config.js: others get an empty list).
async function autocomplete(interaction) {
    const focused = String(interaction.options.getFocused() ?? '').toLowerCase();
    let entries = channelMap.settableMappings();
    if (interaction.options.getSubcommand() === 'clear') {
        const saved = channelMap.readEntries();
        entries = entries.filter(m => saved[m.key]);
    }
    const choices = entries
        .filter(m => !focused || m.key.toLowerCase().includes(focused) || m.label.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(m => ({ name: `${m.label} (${m.key})`.slice(0, 100), value: m.key }));
    return interaction.respond(choices);
}

// Who may run /config is enforced by the router (manifests/config.js: the Admins role).
async function execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') return handleStatus(interaction, client);
    if (sub === 'set') return handleSet(interaction, client);
    if (sub === 'clear') return handleClear(interaction, client);
    return interaction.reply({ content: '❌ Unknown subcommand.', flags: 64 });
}

module.exports = { execute, autocomplete, applySet, pending, sweepPending };
