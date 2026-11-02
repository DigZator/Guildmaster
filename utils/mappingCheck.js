const path = require('path');
const crypto = require('crypto');
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { MAPPINGS } = require('../config/mappings');
const { createJsonStore } = require('./jsonStore');

const PROBLEM_STATUSES = new Set(['unset', 'not_found', 'wrong_type', 'wrong_guild', 'no_access', 'error']);
const SKIPPED_STATUSES = new Set(['unchecked', 'skipped']);

let defaultStoreInstance;
function defaultStore() {
    if (!defaultStoreInstance) {
        defaultStoreInstance = createJsonStore(path.join(__dirname, '../data/mappingReport.json'), { signature: '', postedAt: null, channelId: null });
    }
    return defaultStoreInstance;
}

function severity(result) {
    if (!PROBLEM_STATUSES.has(result.status)) return 'ok';
    return result.status === 'unset' && result.tier !== 'core' ? 'warn' : 'error';
}

function outcome(entry, status, detail, id = null) {
    return { key: entry.key, label: entry.label, tier: entry.tier, gate: entry.gate, usedBy: entry.usedBy, fix: entry.fix, id, status, detail };
}

async function checkOne(client, guild, me, entry, dev) {
    if (dev && entry.skipInDev) return outcome(entry, 'skipped', 'not used in DEV_MODE');

    let id;
    try { id = entry.read(); }
    catch (err) { return outcome(entry, 'error', `could not read the setting: ${err.message}`); }
    if (!id) return outcome(entry, 'unset', 'not set');

    let channel;
    try { channel = await client.channels.fetch(id); }
    catch (err) {
        if (err?.code === 10003) return outcome(entry, 'not_found', 'the channel no longer exists', id);
        if (err?.code === 50001) return outcome(entry, 'no_access', 'the bot cannot see it', id);
        if (err?.code === 50035 || err?.status === 400) return outcome(entry, 'not_found', 'not a valid channel ID', id);
        return outcome(entry, 'error', err?.message ?? String(err), id);
    }
    if (!channel) return outcome(entry, 'not_found', 'the channel no longer exists', id);
    if (channel.guildId !== guild.id) return outcome(entry, 'wrong_guild', 'it belongs to a different server', id);
    if (!entry.types.includes(channel.type)) {
        const expected = entry.types.map(t => ChannelType[t] ?? t).join(' / ');
        return outcome(entry, 'wrong_type', `it is a ${ChannelType[channel.type] ?? channel.type}, expected ${expected}`, id);
    }
    if (channel.locked) return outcome(entry, 'no_access', 'the thread is locked', id);

    const permissions = me ? channel.permissionsFor(me) : null;
    if (!permissions) return outcome(entry, 'no_access', 'the bot permissions could not be read', id);
    const missing = entry.needs.filter(name => !permissions.has(PermissionFlagsBits[name]));
    if (missing.length) return outcome(entry, 'no_access', `the bot is missing ${missing.join(', ')}`, id);

    return outcome(entry, 'ok', 'ok', id);
}

async function checkMappings(client, { mappings = MAPPINGS, guildId = process.env.GUILD_ID, dev = process.env.DEV_MODE === 'true' } = {}) {
    let guild = guildId ? client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null) : null;
    if (!guild) guild = client.guilds.cache.first?.() ?? null;
    if (!guild) return mappings.map(entry => outcome(entry, 'unchecked', 'the server is not available'));

    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    const results = [];
    for (const entry of mappings) results.push(await checkOne(client, guild, me, entry, dev));
    return results;
}

function signature(results) {
    const lines = results
        .filter(r => severity(r) !== 'ok')
        .map(r => `${r.key}|${r.status}|${r.id ?? ''}`)
        .sort();
    return lines.length ? crypto.createHash('sha1').update(lines.join('\n')).digest('hex') : '';
}

function chunkLines(lines, max = 1000) {
    const chunks = [];
    let current = '';
    for (const line of lines) {
        if (current && current.length + line.length + 2 > max) { chunks.push(current); current = ''; }
        current += (current ? '\n\n' : '') + line;
    }
    if (current) chunks.push(current);
    return chunks;
}

function buildReportEmbed(results) {
    const errors = results.filter(r => severity(r) === 'error');
    const warnings = results.filter(r => severity(r) === 'warn');
    const checked = results.filter(r => !SKIPPED_STATUSES.has(r.status));
    const okCount = checked.filter(r => r.status === 'ok').length;

    const embed = new EmbedBuilder()
        .setTitle('Channel mapping check')
        .setColor(errors.length ? 0xED4245 : 0xFEE75C)
        .setDescription(`${okCount} of ${checked.length} mapped channels look good.`)
        .setFooter({ text: 'Shown again only when this list changes.' })
        .setTimestamp();

    const addGroup = (title, items, format) => {
        chunkLines(items.map(format)).forEach((value, i) => {
            embed.addFields({ name: i === 0 ? `${title} (${items.length})` : `${title} (cont.)`, value });
        });
    };
    addGroup('❌ Needs attention', errors, r => `**${r.label}** (\`${r.key}\`): ${r.detail}\n↳ ${r.fix}`);
    addGroup('⚠️ Not set', warnings, r => `**${r.label}** (\`${r.key}\`): used by ${r.usedBy}\n↳ ${r.fix}`);
    return embed;
}

function buildResolvedEmbed() {
    return new EmbedBuilder()
        .setTitle('Channel mapping check')
        .setColor(0x57F287)
        .setDescription('All mapped channels look good now.')
        .setTimestamp();
}

function reportTargets(mappings, dev) {
    const read = (key) => { try { return mappings.find(m => m.key === key)?.read() ?? null; } catch { return null; } };
    const order = dev
        ? ['BOT_DEBUGGING_CHANNEL_ID', 'GUILDMASTER_CTRL_CHANNEL_ID', 'BOT_LOG_CHANNEL_ID']
        : ['GUILDMASTER_CTRL_CHANNEL_ID', 'BOT_LOG_CHANNEL_ID'];
    return [...new Set(order.map(read).filter(Boolean))];
}

async function deliver(client, channelIds, payload, log) {
    for (const id of channelIds) {
        try {
            const channel = await client.channels.fetch(id);
            if (typeof channel?.send !== 'function') continue;
            await channel.send(payload);
            return id;
        } catch (err) {
            log.warn(`[mappingCheck] Could not post to ${id}: ${err.message}`);
        }
    }
    return null;
}

/** @param {any} client @param {{ mappings?: any[], store?: any, log?: any, guildId?: string, dev?: boolean }} [options] */
async function runMappingCheck(client, { mappings = MAPPINGS, store, log = console, guildId, dev = process.env.DEV_MODE === 'true' } = {}) {
    const results = await checkMappings(client, { mappings, guildId, dev });
    const problems = results.filter(r => severity(r) !== 'ok');
    const checked = results.filter(r => !SKIPPED_STATUSES.has(r.status));
    const okCount = checked.filter(r => r.status === 'ok').length;

    log.log(`[mappingCheck] ${okCount}/${checked.length} mappings OK${problems.length ? `, ${problems.length} need attention` : ''}`);
    for (const p of problems) log.warn(`[mappingCheck] ${p.key}: ${p.detail}`);

    const state = store ?? defaultStore();
    const sig = signature(results);
    if (sig === (state.load().signature || '')) return { results, posted: false, reason: 'unchanged' };

    const payload = { embeds: [sig ? buildReportEmbed(results) : buildResolvedEmbed()] };
    const channelId = await deliver(client, reportTargets(mappings, dev), payload, log);
    if (!channelId) {
        log.warn('[mappingCheck] The report could not be delivered; it will be retried on the next start.');
        return { results, posted: false, reason: 'undelivered' };
    }
    state.save({ signature: sig, postedAt: new Date().toISOString(), channelId });
    return { results, posted: true, channelId };
}

function init(client, options) {
    client.once('clientReady', () => {
        runMappingCheck(client, options).catch(err => console.error('[mappingCheck] Check failed:', err));
    });
}

module.exports = { init, runMappingCheck, checkMappings, buildReportEmbed, signature, severity, chunkLines };
