const { EmbedBuilder, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const { TRAP_CHANNEL_ID, BOT_LOG_CHANNEL_ID, INCIDENT_REPORT_CHANNEL_ID } = require('../data/channels');

const LOOKBACK_MS = 3 * 60 * 1000; // 3 minutes
const FETCH_LIMIT = 20; // Discord's max per channel.messages.fetch() call
const DESCRIPTION_LIMIT = 3500; // headroom under embed description's 4096 char cap

function truncateField(text, max = 1000) {
    if (!text) return '*[no text content]*';
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function compileRecentMessages(guild, authorId, client) {
    const cutoff = Date.now() - LOOKBACK_MS;
    const collected = [];

    for (const channel of guild.channels.cache.values()) {
        if (!channel.isTextBased()) continue;

        const permissions = channel.permissionsFor(client.user);
        if (!permissions?.has(PermissionsBitField.Flags.ViewChannel) ||
            !permissions.has(PermissionsBitField.Flags.ReadMessageHistory)) {
            continue;
        }

        try {
            const messages = await channel.messages.fetch({ limit: FETCH_LIMIT });
            for (const msg of messages.values()) {
                if (msg.author.id === authorId && msg.createdTimestamp >= cutoff) {
                    collected.push({
                        content: msg.content,
                        createdTimestamp: msg.createdTimestamp,
                        channelName: channel.name,
                        messageRef: msg,
                    });
                }
            }
        } catch (error) {
            console.warn(`[trapChannel] Skipping #${channel.name}, could not fetch messages:`, error.message);
        }
    }

    return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function postIncidentReport(client, embed, attachment) {
    for (const channelId of [BOT_LOG_CHANNEL_ID, INCIDENT_REPORT_CHANNEL_ID]) {
        try {
            const channel = await client.channels.fetch(channelId);
            await channel.send({ embeds: [embed], files: attachment ? [attachment] : [] });
        } catch (error) {
            console.warn(`[trapChannel] Failed to post incident report to channel ${channelId}:`, error.message);
        }
    }
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
		// console.log('MESSAGE:', message.content);
        if (message.channelId !== TRAP_CHANNEL_ID) return;
        if (message.author.id === client.user.id) return; // never react to the bot's own messages

        try {
            const accountAgeTimestamp = Math.floor(message.author.createdTimestamp / 1000);
            const joinAgeTimestamp = message.member?.joinedTimestamp
                ? Math.floor(message.member.joinedTimestamp / 1000)
                : null;

            const compiledLog = await compileRecentMessages(message.guild, message.author.id, client);

            const logText = compiledLog.length
                ? compiledLog
                    .map(m => `[${new Date(m.createdTimestamp).toLocaleTimeString()}] #${m.channelName}: ${m.content || '*[no text content]*'}`)
                    .join('\n')
                : '*No other messages found in the last 3 minutes.*';

            const embed = new EmbedBuilder()
                .setTitle('🪤 Trap Channel Triggered')
                .setColor(0xED4245)
                .addFields(
                    { name: 'User', value: `${message.author.tag} (<@${message.author.id}>)`, inline: false },
                    { name: 'Account Created', value: `<t:${accountAgeTimestamp}:R>`, inline: true },
                    { name: 'Server Joined', value: joinAgeTimestamp ? `<t:${joinAgeTimestamp}:R>` : 'Unknown', inline: true },
                    { name: 'Trap Message', value: truncateField(message.content), inline: false },
                )
                .setTimestamp();

            let attachment = null;
            if (logText.length > DESCRIPTION_LIMIT) {
                attachment = new AttachmentBuilder(Buffer.from(logText, 'utf-8'), {
                    name: `incident-${message.author.id}-${Date.now()}.txt`,
                });
                embed.setDescription('Compiled message log exceeded the embed size limit — see attached file.');
            } else {
                embed.setDescription(logText);
            }

            await postIncidentReport(client, embed, attachment);

            // --- Cleanup (disabled during testing phase) ---
            // await message.delete().catch((err) => console.warn('[trapChannel] Failed to delete trap message:', err.message));
            // for (const m of compiledLog) {
            //     await m.messageRef.delete().catch((err) => console.warn('[trapChannel] Failed to delete compiled message:', err.message));
            // }

            // --- Enforcement (disabled during testing phase) ---
            // if (message.member) {
            //     await message.member.kick('Triggered trap channel').catch((err) => console.warn('[trapChannel] Failed to kick member:', err.message));
            // }
        } catch (error) {
            console.error('[trapChannel] Failed to process trap trigger:', error);
        }
    });
};
