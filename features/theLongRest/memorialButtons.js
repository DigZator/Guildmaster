const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildPreviewButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('memorial_preview_confirm').setLabel('Submit').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('memorial_preview_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
    );
}

function buildModButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('memorial_mod_approve').setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('memorial_mod_deny').setLabel('Deny').setStyle(ButtonStyle.Danger),
    );
}

module.exports = { buildPreviewButtons, buildModButtons };
