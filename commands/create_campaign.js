const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { randomBytes } = require('crypto');
const { isAdminChannel } = require('../utils/isAdminChannel');
const { GUILDMASTER_CTRL_CHANNEL_ID } = require('../data/channels');

const ADMINS_ROLE_ID     = process.env.ADMINS_ROLE_ID;
const CLANKERS_ROLE_ID   = process.env.CLANKERS_ROLE_ID;
const ADVENTURER_ROLE_ID = process.env.ADVENTURER_ROLE_ID;
const DM_ROLE_ID         = process.env.DM_ROLE_ID;

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
    if (!ADVENTURER_ROLE_ID) {
        await interaction.reply({ content: '❌ `ADVENTURER_ROLE_ID` is not configured — cannot set up spectator permissions. Add it to `.env` first.', flags: 64 });
        return;
    }

    // ── Required spectator-permission questions ─────────────────────────────
    const spectatorsReadChat     = interaction.options.getBoolean('spectators_read_chat', true);
    const spectatorsSendMessages = interaction.options.getBoolean('spectators_send_messages', true);
    const spectatorsJoinVoice    = interaction.options.getBoolean('spectators_join_voice', true);

    // ── Optional questions ───────────────────────────────────────────────────
    const useStage = interaction.options.getBoolean('use_stage') ?? false;
    const dmUser   = interaction.options.getUser('dm');

    if (dmUser && !DM_ROLE_ID) {
        await interaction.reply({ content: '❌ `DM_ROLE_ID` is not configured — cannot assign the DM role. Add it to `.env` or omit the `dm` option.', flags: 64 });
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const rawName = interaction.options.getString('name');
    const usingDefaultName = !rawName || !rawName.trim();
    const baseName = usingDefaultName ? generateDefaultName() : rawName.trim();

    const roleName     = usingDefaultName ? baseName : slugify(baseName);
    const categoryName = roleName;
    const textName      = roleName;
    const voiceChannelType = useStage ? ChannelType.GuildStageVoice : ChannelType.GuildVoice;
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
        c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.name.toLowerCase() === voiceName.toLowerCase()
    );
    if (existingVoice) {
        await interaction.editReply({ content: `❌ A voice/stage channel named \`${voiceName}\` already exists. Pick a different name or remove it first.` });
        return;
    }

    let campaignRole, category, textChannel, voiceChannel, dmRoleGranted = false;

    try {
        campaignRole = await guild.roles.create({
            name: roleName,
            reason: `create_campaign by ${interaction.user.tag}`,
        });
        console.log(`[create_campaign] ✅ Created role "${roleName}" (${campaignRole.id})`);

        // Spectators (ADVENTURER_ROLE_ID) can view the category only if they're
        // allowed to read the text chat — otherwise they stay fully denied like @everyone.
        const categoryOverwrites = [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: ADMINS_ROLE_ID,   allow: [PermissionFlagsBits.ViewChannel] },
            { id: CLANKERS_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel] },
            { id: campaignRole.id,  allow: [PermissionFlagsBits.ViewChannel] },
        ];
        if (spectatorsReadChat) {
            categoryOverwrites.push({ id: ADVENTURER_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel] });
        }

        category = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            reason: `create_campaign by ${interaction.user.tag}`,
            permissionOverwrites: categoryOverwrites,
        });
        console.log(`[create_campaign] ✅ Created category "${categoryName}" (${category.id})`);

        // Text channel: spectators can only send if they can also read.
        const textOverwrites = [];
        if (spectatorsReadChat && spectatorsSendMessages) {
            textOverwrites.push({ id: ADVENTURER_ROLE_ID, allow: [PermissionFlagsBits.SendMessages] });
        } else if (spectatorsReadChat && !spectatorsSendMessages) {
            textOverwrites.push({ id: ADVENTURER_ROLE_ID, deny: [PermissionFlagsBits.SendMessages] });
        }

        textChannel = await guild.channels.create({
            name: textName,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: `create_campaign by ${interaction.user.tag}`,
            permissionOverwrites: textOverwrites.length ? textOverwrites : undefined,
        });
        console.log(`[create_campaign] ✅ Created text channel "${textName}" (${textChannel.id})`);

        const voiceOverwrites = [];
        if (!spectatorsJoinVoice) {
            voiceOverwrites.push({ id: ADVENTURER_ROLE_ID, deny: [PermissionFlagsBits.Connect] });
        }

        voiceChannel = await guild.channels.create({
            name: voiceName,
            type: voiceChannelType,
            parent: category.id,
            reason: `create_campaign by ${interaction.user.tag}`,
            permissionOverwrites: voiceOverwrites.length ? voiceOverwrites : undefined,
        });
        console.log(`[create_campaign] ✅ Created ${useStage ? 'stage' : 'voice'} channel "${voiceName}" (${voiceChannel.id})`);

        if (dmUser) {
            const dmMember = await guild.members.fetch(dmUser.id).catch(() => null);
            if (dmMember) {
                if (!dmMember.roles.cache.has(DM_ROLE_ID)) {
                    await dmMember.roles.add(DM_ROLE_ID, `create_campaign by ${interaction.user.tag}`);
                    dmRoleGranted = true;
                    console.log(`[create_campaign] ✅ Granted DM role to ${dmUser.tag} (${dmUser.id})`);
                }
                await dmMember.roles.add(campaignRole.id, `create_campaign by ${interaction.user.tag}`)
                    .then(() => console.log(`[create_campaign] ✅ Granted campaign role "${roleName}" to DM ${dmUser.tag} (${dmUser.id})`))
                    .catch(e => console.error(`[create_campaign] ⚠️ Failed to grant campaign role to DM ${dmUser.tag}:`, e));
            } else {
                console.warn(`[create_campaign] ⚠️ Could not fetch DM member ${dmUser.id} in guild — skipped role grants.`);
            }
        }
    } catch (err) {
        console.error('[create_campaign] ❌ Failed mid-setup, rolling back:', err);

        const cleanup = [
            voiceChannel  && voiceChannel.delete('create_campaign rollback')
                .then(() => console.log('[create_campaign] 🗑️ Rollback: deleted voice/stage channel'))
                .catch(e => console.error('[create_campaign] ⚠️ Rollback: failed to delete voice/stage channel', e)),
            textChannel   && textChannel.delete('create_campaign rollback')
                .then(() => console.log('[create_campaign] 🗑️ Rollback: deleted text channel'))
                .catch(e => console.error('[create_campaign] ⚠️ Rollback: failed to delete text channel', e)),
            category      && category.delete('create_campaign rollback')
                .then(() => console.log('[create_campaign] 🗑️ Rollback: deleted category'))
                .catch(e => console.error('[create_campaign] ⚠️ Rollback: failed to delete category', e)),
            campaignRole  && campaignRole.delete('create_campaign rollback')
                .then(() => console.log('[create_campaign] 🗑️ Rollback: deleted role'))
                .catch(e => console.error('[create_campaign] ⚠️ Rollback: failed to delete role', e)),
        ].filter(Boolean);
        await Promise.all(cleanup);

        if (dmRoleGranted && dmUser) {
            const dmMember = await guild.members.fetch(dmUser.id).catch(() => null);
            if (dmMember?.roles.cache.has(DM_ROLE_ID)) {
                await dmMember.roles.remove(DM_ROLE_ID, 'create_campaign rollback')
                    .then(() => console.log(`[create_campaign] 🗑️ Rollback: removed DM role from ${dmUser.tag}`))
                    .catch(e => console.error('[create_campaign] ⚠️ Rollback: failed to remove DM role', e));
            }
        }

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
            })
                .then(() => console.log('[create_campaign] 📨 Posted failure report to guildmaster-ctrl'))
                .catch(e => console.error('[create_campaign] ⚠️ Failed to post failure report to guildmaster-ctrl:', e));
        } else {
            console.error('[create_campaign] ⚠️ GUILDMASTER_CTRL_CHANNEL_ID not configured or channel not found — could not post failure report.');
        }

        await interaction.editReply({ content: `❌ Something went wrong while setting up the campaign — everything that was created has been rolled back. An error report was sent to guildmaster-ctrl.\n\`${err.message}\`` });
        return;
    }

    console.log(`[create_campaign] ✅ Campaign "${roleName}" fully created — role ${campaignRole.id}, category ${category.id}, text ${textChannel.id}, ${useStage ? 'stage' : 'voice'} ${voiceChannel.id}${dmUser ? `, DM ${dmUser.tag}` : ''}`);

    const successEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('✅ Campaign Created')
        .addFields(
            { name: 'Role',     value: `<@&${campaignRole.id}>`, inline: true },
            { name: 'Category', value: category.name,            inline: true },
            { name: '\u200b',   value: '\u200b',                 inline: true },
            { name: 'Text Channel',  value: `<#${textChannel.id}>`,  inline: true },
            { name: useStage ? 'Stage Channel' : 'Voice Channel', value: `<#${voiceChannel.id}>`, inline: true },
            { name: '\u200b',   value: '\u200b',                 inline: true },
            { name: 'Spectators can read chat',    value: spectatorsReadChat ? 'Yes' : 'No', inline: true },
            { name: 'Spectators can send messages', value: spectatorsReadChat && spectatorsSendMessages ? 'Yes' : 'No', inline: true },
            { name: 'Spectators can join voice/stage', value: spectatorsJoinVoice ? 'Yes' : 'No', inline: true },
            ...(dmUser ? [{ name: 'DM', value: `<@${dmUser.id}>`, inline: true }] : []),
        )
        .setTimestamp();

    if (useStage) {
        successEmbed.addFields({
            name: '⚠️ Manual step required',
            value:
                `The bot can't grant speaker permissions on stage channels (Discord blocks it unless the bot itself has Mute/Move Members). ` +
                `To let **<@&${campaignRole.id}>** join <#${voiceChannel.id}> as a speaker instead of an audience member:\n` +
                `1. Open the stage channel's settings → **Permissions**.\n` +
                `2. Add the **${roleName}** role.\n` +
                `3. Grant it **Mute Members** and **Move Members** (or simply make them a Speaker directly during the session via the Stage UI).`,
            inline: false,
        });
    }

    await interaction.editReply({ embeds: [successEmbed] });
};
