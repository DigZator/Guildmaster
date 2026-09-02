const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../utils/isAdminChannel');
const { findCharacterStatusIssues } = require('../../utils/leagueNotion');

async function handleAdminAuditCharacters(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    let result;
    try {
        result = await findCharacterStatusIssues();
    } catch (err) {
        console.error('[leagueadmin audit characters] Notion error:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }

    const { violations, noActive } = result;

    const nameOf = c => c.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    const embed = new EmbedBuilder()
        .setColor(violations.length > 0 ? 0xed4245 : 0x57f287)
        .setTitle('🔍 Character Status Audit')
        .setTimestamp();

    if (violations.length === 0) {
        embed.addFields({ name: '✅ No violations', value: 'No Discord ID has more than one Active character.' });
    } else {
        const violationLines = violations.map(v =>
            `<@${v.discordId}> — ${v.characters.map(c => `**${nameOf(c)}**`).join(', ')} are all Active`
        );
        embed.addFields({
            name: `⚠️ ${violations.length} violation(s) — multiple Active characters`,
            value: violationLines.join('\n').slice(0, 1024),
        });
    }

    if (noActive.length > 0) {
        const infoLines = noActive.map(v =>
            `<@${v.discordId}> — ${v.characters.map(c => `${nameOf(c)} (${c.properties['Status']?.select?.name ?? 'Unknown'})`).join(', ')}`
        );
        embed.addFields({
            name: `ℹ️ ${noActive.length} informational — no Active character`,
            value: infoLines.join('\n').slice(0, 1024),
        });
    }

    return interaction.editReply({ embeds: [embed] });
}

module.exports = {
    handleAdminAuditCharacters,
};
