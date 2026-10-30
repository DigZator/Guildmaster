const { EmbedBuilder } = require('discord.js');
const { isAdminChannel } = require('../../../utils/isAdminChannel');
const { getById, removeById } = require('../../../utils/pendingActions');
const { sendAdminLog } = require('../../../utils/adminLog');

// ─── /leagueadmin clear ────────────────────────────────────────────────────────
async function handleClear(interaction) {
    if (!isAdminChannel(interaction, 'league')) {
        return interaction.reply({ content: '❌ You must be an admin or use this in the league admin channel.', flags: 64 });
    }

    const ids = interaction.options.getString('id').split(',').map(s => s.trim()).filter(Boolean);
    await interaction.deferReply({ flags: 64 });

    const results = [];

    for (const id of ids) {
        const entry = getById(id);
        if (!entry) {
            results.push(`❌ \`${id}\` — not found.`);
            continue;
        }

        removeById(id);

        try {
            await sendAdminLog(interaction.guild, new EmbedBuilder()
                .setColor(0x99aab5)
                .setTitle('🗑️ Pending Action Force-Cleared')
                .setDescription('⚠️ Removed from the pending queue directly — no approve/reject logic ran. If the underlying change had already applied before this got stuck, it was **not** verified or undone here. Check the character/quest/inventory manually if unsure.')
                .addFields(
                    { name: 'Action ID',    value: `\`${entry.id}\``,                                                                 inline: true },
                    { name: 'Type',         value: entry.type,                                                                        inline: true },
                    { name: 'Status',       value: entry.status ?? 'pending',                                                         inline: true },
                    { name: 'Target',       value: entry.target?.characterName ?? entry.quest?.questName ?? 'N/A',                    inline: true },
                    { name: 'Requested By', value: entry.dm?.discordId ? `<@${entry.dm.discordId}>` : 'N/A',                          inline: true },
                    { name: 'Cleared By',   value: `<@${interaction.user.id}>`,                                                       inline: true },
                )
                .setTimestamp()
            );
        } catch (logErr) {
            console.warn(`[leagueadmin clear] Cleared ${id} but admin log failed:`, logErr.message);
        }

        results.push(`🗑️ \`${id}\` (${entry.type}) — force-cleared from pending queue.\n⚠️ **Warning:** this did not approve, reject, undo, or verify anything. If this action's change (gold, item, rep, etc.) had already partially applied before it got stuck, that change is still in effect — check manually before re-issuing the grant.`);
    }

    return interaction.editReply({ content: results.join('\n\n') });
}

module.exports = {
    handleClear,
};
