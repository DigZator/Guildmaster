const { getActiveCharacter } = require('../notion');

const DM_ROLE_ID = process.env.DM_ROLE_ID;
const REP_MAX    = 2;

// ─── Shared resolvers ─────────────────────────────────────────────────────────
async function resolveTarget(interaction) {
    const targetUser = interaction.options.getUser('user');
    const character  = await getActiveCharacter(targetUser.id);
    if (!character) {
        await interaction.editReply({
            content: `❌ **${targetUser.displayName}** does not have an active character.`,
        });
        return null;
    }
    return { targetUser, character };
}

module.exports = {
    DM_ROLE_ID,
    REP_MAX,
    resolveTarget,
};
