const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { requiredBotPermissions } = require('../../utils/campaignPermissions');
const {
    ADMINS_ROLE_ID,
    CLANKERS_ROLE_ID,
    ADVENTURER_ROLE_ID,
    DM_ROLE_ID,
    MAX_PLAYERS,
    MAX_NAME_LENGTH,
    GUILD_ROLE_LIMIT,
    GUILD_CHAN_LIMIT,
} = require('./constants');
const { slugify, describeError } = require('./helpers');

function readOptions(interaction) {
    const playerUsers = [];
    for (let slot = 1; slot <= MAX_PLAYERS; slot++) {
        const user = interaction.options.getUser(`player_${slot}`);
        if (user) playerUsers.push({ slot, user });
    }
    return {
        rawName:       interaction.options.getString('name', true),
        dmUser:        interaction.options.getUser('dm', true),
        useStage:      interaction.options.getBoolean('use_stage') ?? false,
        readChat:      interaction.options.getBoolean('spectators_read_chat', true),
        sendMessages:  interaction.options.getBoolean('spectators_send_messages', true),
        joinVoice:     interaction.options.getBoolean('spectators_join_voice', true),
        sendVoiceChat: interaction.options.getBoolean('spectators_send_voice_chat', true),
        playerUsers,
    };
}

// ── Preflight: everything that can be checked BEFORE anything is created ────
async function preflight(interaction, opts) {
    const guild = interaction.guild;
    const problems = [];

    // Names — role, category and voice keep the casing that was typed;
    const baseName = opts.rawName.trim();
    const textName = slugify(baseName);
    const roleName = baseName;
    const categoryName = baseName;
    const voiceName = `[Table] ${baseName}`;

    if (!baseName) {
        problems.push('The campaign name is empty.');
    } else {
        if (baseName.length > MAX_NAME_LENGTH) {
            problems.push(`The campaign name is ${baseName.length} characters; the maximum is ${MAX_NAME_LENGTH}.`);
        }
        if (baseName.includes('@')) {
            problems.push('The campaign name cannot contain `@`.');
        }
        if (!textName) {
            problems.push('The name has no letters or numbers, so a text channel name cannot be made from it.');
        }
    }

    // Configuration
    const config = [
        ['ADMINS_ROLE_ID', ADMINS_ROLE_ID],
        ['CLANKERS_ROLE_ID', CLANKERS_ROLE_ID],
        ['ADVENTURER_ROLE_ID', ADVENTURER_ROLE_ID],
        ['DM_ROLE_ID', DM_ROLE_ID],
    ];
    const unset = config.filter(([, value]) => !value).map(([name]) => `\`${name}\``);
    if (unset.length) problems.push(`Not configured in \`.env\`: ${unset.join(', ')}.`);

    if (ADMINS_ROLE_ID && (ADMINS_ROLE_ID === CLANKERS_ROLE_ID || ADMINS_ROLE_ID === ADVENTURER_ROLE_ID || CLANKERS_ROLE_ID === ADVENTURER_ROLE_ID)) {
        problems.push('`ADMINS_ROLE_ID`, `CLANKERS_ROLE_ID` and `ADVENTURER_ROLE_ID` must be three different roles.');
    }

    let roles = null;
    let channels = null;
    try {
        roles = await guild.roles.fetch();
        channels = (await guild.channels.fetch()).filter(Boolean);
    } catch (err) {
        problems.push(`Could not read the server's roles/channels: ${describeError(err)}`);
    }

    if (roles) {
        for (const [name, value] of config) {
            if (value && !roles.has(value)) problems.push(`\`${name}\` points to a role that doesn't exist in this server.`);
        }

        const lower = baseName.toLowerCase();
        if (baseName && roles.find(r => r.name.toLowerCase() === lower)) {
            problems.push(`A role named \`${roleName}\` already exists.`);
        }
        if (roles.size + 1 > GUILD_ROLE_LIMIT) {
            problems.push(`The server is at its role limit (${GUILD_ROLE_LIMIT}).`);
        }
    }

    if (channels && baseName) {
        const lower = baseName.toLowerCase();
        if (channels.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === lower)) {
            problems.push(`A category named \`${categoryName}\` already exists.`);
        }
        if (textName && channels.find(c => c.type === ChannelType.GuildText && c.name.toLowerCase() === textName)) {
            problems.push(`A text channel named \`${textName}\` already exists.`);
        }
        if (channels.find(c => (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && c.name.toLowerCase() === voiceName.toLowerCase())) {
            problems.push(`A voice/stage channel named \`${voiceName}\` already exists.`);
        }
        const nonThread = channels.filter(c => !c.isThread()).size;
        if (nonThread + 3 > GUILD_CHAN_LIMIT) {
            problems.push(`The server doesn't have room for 3 more channels (limit ${GUILD_CHAN_LIMIT}).`);
        }
    }

    let me = guild.members.me;
    if (!me) me = await guild.members.fetchMe().catch(() => null);
    let moderateStage = false;
    if (!me) {
        problems.push("Could not load the bot's own member record to check its permissions.");
    } else {
        const missing = me.permissions.missing(requiredBotPermissions({ useStage: opts.useStage }));
        if (missing.length) {
            problems.push(`The bot is missing permissions it needs to set this up: ${missing.map(m => `\`${m}\``).join(', ')}.`);
        }
        moderateStage = opts.useStage && me.permissions.has([PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers]);
    }

    // The DM
    let dmMember = null;
    let dmNeedsRole = false;
    if (opts.dmUser.bot) {
        problems.push('The DM cannot be a bot.');
    } else {
        dmMember = await guild.members.fetch(opts.dmUser.id).catch(() => null);
        if (!dmMember) {
            problems.push(`<@${opts.dmUser.id}> is not a member of this server.`);
        } else if (DM_ROLE_ID) {
            dmNeedsRole = !dmMember.roles.cache.has(DM_ROLE_ID);
            const dmRole = roles?.get(DM_ROLE_ID);
            if (dmNeedsRole && dmRole && me && me.roles.highest.comparePositionTo(dmRole) <= 0) {
                problems.push(`The bot's highest role is not above the DM role (\`${dmRole.name}\`), so it can't grant it. Move the bot's role higher.`);
            }
        }
    }

    // Players
    const seen = new Set([opts.dmUser.id]);
    const playerPlan = [];
    for (const { slot, user } of opts.playerUsers) {
        const item = { slot, user, member: null, skip: null };
        if (user.id === opts.dmUser.id) item.skip = 'same person as the DM';
        else if (seen.has(user.id))     item.skip = 'listed more than once';
        else if (user.bot)              item.skip = 'is a bot';
        else {
            seen.add(user.id);
            item.member = await guild.members.fetch(user.id).catch(() => null);
            if (!item.member) item.skip = 'not a member of this server';
        }
        playerPlan.push(item);
    }

    return {
        problems,
        plan: {
            baseName, roleName, categoryName, textName, voiceName,
            roleIds: {
                everyone:   guild.roles.everyone.id,
                admins:     ADMINS_ROLE_ID,
                clankers:   CLANKERS_ROLE_ID,
                adventurer: ADVENTURER_ROLE_ID,
            },
            dmMember, dmNeedsRole, playerPlan, moderateStage,
        },
    };
}

module.exports = {
    readOptions,
    preflight,
};
