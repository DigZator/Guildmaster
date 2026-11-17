// FROZEN REFERENCE: the old /verification admin check (features/verification/admin.js, nothing in the bot used it any more),
// kept so the tests can prove the policy "admin_or_discord_admin" answers exactly like it. Nothing in the bot loads this.
const { isAdminChannel } = require('./isAdminChannel');

function isVerificationAdmin(interaction) {
    return isAdminChannel(interaction, 'botAdmin')
        || (interaction.memberPermissions?.has('Administrator') ?? false);
}

module.exports = { isVerificationAdmin };
