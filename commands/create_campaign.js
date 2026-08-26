const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { randomBytes } = require('crypto');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

const ADMINS_ROLE_ID   = process.env.ADMINS_ROLE_ID;
const CLANKERS_ROLE_ID = process.env.CLANKERS_ROLE_ID;

function slugify(input) {
    return input
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 90);
}

function generateDefaultName() {
    return `default-${randomBytes(1).toString('hex')}`;
}

module.exports = async (interaction) => {
    if (!isAdminChannel(interaction, 'botAdmin')) {
        await interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 64 });
        return;
    }

    if (!ADMINS_ROLE_ID) {
        await interaction.reply({ content: '❌ `ADMINS_ROLE_ID` is not configured — cannot set up category permissions.', flags: 64 });
        return;
    }
    if (!CLANKERS_ROLE_ID) {
        await interaction.reply({ content: '❌ `CLANKERS_ROLE_ID` is not configured — cannot set up category permissions.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const rawName = interaction.options.getString('name');
    const usingDefaultName = !rawName || !rawName.trim();
    const baseName = usingDefaultName ? generateDefaultName() : rawName.trim();

    const roleName      = usingDefaultName ? baseName : slugify(baseName);
    const categoryName  = roleName;
    const textName      = `${roleName}-table`;
    const voiceName      = `[Table] ${baseName}`;

    if (!roleName) {
        await interaction.editReply({ content: '❌ That name could not be turned into a valid role/channel name. Please try a different name.' });
        return;
    }

    const guild = interaction.guild;

    const existingRole = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (existingRole) {
        await interaction.editReply({ content: `❌ A role named \`${roleName}\` already exists. Pick a different name or remove it first.` });
        return;
    }

    const existingCategory = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase()
    );
    if (existingCategory) {
        await interaction.editReply({ content: `❌ A category named \`${categoryName}\` already exists. Pick a different name or remove it first.` });
        return;
    }

    const existingText = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name.toLowerCase() === textName.toLowerCase()
    );
    if (existingText) {
        await interaction.editReply({ content: `❌ A text channel named \`${textName}\` already exists. Pick a different name or remove it first.` });
        return;
    }

    const existingVoice = guild.channels.cache.find(
        c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === voiceName.toLowerCase()
    );
    if (existingVoice) {
        await interaction.editReply({ content: `❌ A voice channel named \`${voiceName}\` already exists. Pick a different name or remove it first.` });
        return;
    }

    let campaignRole, category, textChannel, voiceChannel;

    try {
        campaignRole = await guild.roles.create({
            name: roleName,
            reason: `create_campaign by ${interaction.user.tag}`,
        });

        category = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            reason: `create_campaign by ${interaction.user.tag}`,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: ADMINS_ROLE_ID,   allow: [PermissionFlagsBits.ViewChannel] },
                { id: CLANKERS_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel] },
                { id: campaignRole.id,  allow: [PermissionFlagsBits.ViewChannel] },
            ],
        });

        textChannel = await guild.channels.create({
            name: textName,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: `create_campaign by ${interaction.user.tag}`,
        });

        voiceChannel = await guild.channels.create({
            name: voiceName,
            type: ChannelType.GuildVoice,
            parent: category.id,
            reason: `create_campaign by ${interaction.user.tag}`,
        });
    } catch (err) {
        console.error('[create_campaign] Failed mid-setup, rolling back:', err);

        const cleanup = [
            voiceChannel  && voiceChannel.delete('create_campaign rollback').catch(e => console.error('[create_campaign] rollback: failed to delete voice channel', e)),
            textChannel   && textChannel.delete('create_campaign rollback').catch(e => console.error('[create_campaign] rollback: failed to delete text channel', e)),
            category      && category.delete('create_campaign rollback').catch(e => console.error('[create_campaign] rollback: failed to delete category', e)),
            campaignRole  && campaignRole.delete('create_campaign rollback').catch(e => console.error('[create_campaign] rollback: failed to delete role', e)),
        ].filter(Boolean);
        await Promise.all(cleanup);

        const ctrlChannel = GUILDMASTER_CTRL_CHANNEL_ID ? guild.channels.cache.get(GUILDMASTER_CTRL_CHANNEL_ID) : null;
        if (ctrlChannel) {
            await ctrlChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle('⚠️ create_campaign Failed — Rolled Back')
                        .setDescription(`Campaign setup for \`${roleName}\` failed partway through. Everything created has been rolled back.`)
                        .addFields(
                            { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
                            { name: 'Name',          value: roleName,                    inline: true },
                            { name: 'Error',         value: `\`${err.message}\``,        inline: false },
                        )
                        .setTimestamp(),
                ],
            }).catch(e => console.error('[create_campaign] Failed to post failure report to guildmaster-ctrl:', e));
        } else {
            console.error('[create_campaign] GUILDMASTER_CTRL_CHANNEL_ID not configured or channel not found — could not post failure report.');
        }

        await interaction.editReply({ content: `❌ Something went wrong while setting up the campaign — everything that was created has been rolled back. An error report was sent to guildmaster-ctrl.\n\`${err.message}\`` });
        return;
    }

    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Campaign Created')
                .addFields(
                    { name: 'Role',     value: `<@&${campaignRole.id}>`, inline: true },
                    { name: 'Category', value: category.name,            inline: true },
                    { name: '\u200b',   value: '\u200b',                 inline: true },
                    { name: 'Text Channel',  value: `<#${textChannel.id}>`,  inline: true },
                    { name: 'Voice Channel', value: `<#${voiceChannel.id}>`, inline: true },
                )
                .setTimestamp(),
        ],
    });
};
