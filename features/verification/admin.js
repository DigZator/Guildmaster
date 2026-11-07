const { isAdminChannel } = require('../../utils/isAdminChannel');

function isVerificationAdmin(interaction) {
    return isAdminChannel(interaction, 'botAdmin')
        || (interaction.memberPermissions?.has('Administrator') ?? false);
}

module.exports = { isVerificationAdmin };
