const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
} = require('discord.js');
const {
    getActiveCharacter,
    getCharacterQuestLog,
    getCharactersByDiscordId,
    updateCharacterArt,
} = require('../utils/leagueNotion');
const { sendInventory } = require('./inventory');
const { showBalance } = require('../commands/league');
const { handleDowntimeList } = require('../commands/leagueDowntime');
const { LEAGUE_ART_ARCHIVE_THREAD_ID, LEAGUE_PROFILES_FORUM_ID } = require('../data/channels');

const MAX_IMAGE_SIZE = 8 * 1024 * 1024; // 8MB
const ART_TIMEOUT_MS = 5 * 60 * 1000;

// ─── Dashboard message ───────────────────────────────────────────────────

function buildDashboardEmbed(character) {
    const embed = new EmbedBuilder()
        .setTitle('Character Dashboard')
        .setColor(0x5865f2);

    if (!character) {
        embed.setDescription(
            'You dont currently have an active character.\n\n' +
            'Use /league create to register one, or Switch Character below if you have a Passive character to reactivate.'
        );
        return embed;
    }

    const p = character.properties;
    const characterName = p['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const classLevels   = p['Class']?.rich_text?.[0]?.plain_text ?? 'Unknown';
    const level         = p['Level']?.number ?? 1;
    const forumThreadId = p['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
    const gotStarterItems = p['Got SE']?.checkbox ?? false;

    embed.setDescription(
        `Active Character: ${characterName} (${classLevels}, Level ${level})\n` +
        (forumThreadId ? `Thread: <#${forumThreadId}>` : 'Thread: N/A')
    );

    if (!gotStarterItems) {
        embed.addFields({
            name: '⚠️ Starter Items Not Collected',
            value: 'You haven\'t claimed your starting equipment for this character yet. Run `/league starter-items` to claim it.',
        });
    }

    return embed;
}

function buildDashboardRows(hasActive) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('leagueDashProfile').setLabel('Profile').setStyle(ButtonStyle.Primary).setDisabled(!hasActive),
        new ButtonBuilder().setCustomId('leagueDashQuests').setLabel('Quests').setStyle(ButtonStyle.Secondary).setDisabled(!hasActive),
        new ButtonBuilder().setCustomId('leagueDashDowntimes').setLabel('Downtimes').setStyle(ButtonStyle.Secondary).setDisabled(!hasActive),
        new ButtonBuilder().setCustomId('leagueDashInventory').setLabel('Inventory').setStyle(ButtonStyle.Secondary).setDisabled(!hasActive),
        new ButtonBuilder().setCustomId('leagueDashBalance').setLabel('Balance').setStyle(ButtonStyle.Secondary).setDisabled(!hasActive),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('leagueDashSwitch').setLabel('Switch Character').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('leagueDashEdit').setLabel('Edit Details').setStyle(ButtonStyle.Secondary).setDisabled(!hasActive),
        new ButtonBuilder().setCustomId('leagueDashSetArt').setLabel('Set Art').setStyle(ButtonStyle.Secondary).setDisabled(!hasActive),
    );

    return [row1, row2];
}

// ─── Read-only buttons (Profile / Quests / Downtimes / Inventory / Balance) ──

async function handleProfileButton(interaction) {
    await interaction.deferReply({ flags: 64 });

    const character = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!character) {
        return interaction.editReply({ content: 'You do not have an active character. Use /league create to register one.' });
    }

    const p = character.properties;
    const characterName = p['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const classLevels   = p['Class']?.rich_text?.[0]?.plain_text ?? 'Unknown';
    const level         = p['Level']?.number ?? 1;
    const username      = p['Username']?.rich_text?.[0]?.plain_text ?? 'Unknown';
    const forumThreadId = p['Forum Thread Id']?.rich_text?.[0]?.plain_text ?? null;
    const charArtURL    = p['CharArtURL']?.url ?? null;
    const charSheetLink = p['CharSheetLink']?.url ?? null;

    const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(characterName)
        .addFields(
            { name: 'Class',   value: classLevels, inline: true },
            { name: 'Level',   value: String(level), inline: true },
            { name: 'Player',  value: `<@${interaction.user.id}> (${username})`, inline: true },
            { name: 'Thread',  value: forumThreadId ? `<#${forumThreadId}>` : 'N/A', inline: true },
            { name: 'Character Sheet', value: charSheetLink ? `[Link](${charSheetLink})` : 'Not set', inline: true },
        )
        .setTimestamp();

    if (charArtURL) embed.setThumbnail(charArtURL);

    return interaction.editReply({ embeds: [embed] });
}

function formatDateIST(dateString) {
    if (!dateString) return 'Unknown';
    const parsed = new Date(dateString);
    if (isNaN(parsed)) return dateString;
    return parsed.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

async function handleQuestsButton(interaction) {
    await interaction.deferReply({ flags: 64 });

    const character = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!character) {
        return interaction.editReply({ content: 'You do not have an active character. Use /league create to register one.' });
    }

    const charName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const entries = await getCharacterQuestLog(character.id);

    if (entries.length === 0) {
        return interaction.editReply({ content: `${charName} hasn't been on any quests yet.` });
    }

    const rows = entries.map(quest => ({
        questId:       quest.properties['Quest ID']?.rich_text?.[0]?.plain_text ?? '-',
        adventureName: quest.properties['Adventure Name']?.title?.[0]?.plain_text ?? 'Unknown',
        date:          formatDateIST(quest.properties['Date']?.date?.start),
        status:        quest.properties['Status']?.select?.name ?? 'Unknown',
    }));

    const idWidth   = Math.max(8, ...rows.map(r => r.questId.length));
    const nameWidth = Math.max(14, ...rows.map(r => r.adventureName.length));
    const dateWidth = Math.max(9, ...rows.map(r => r.date.length));

    const header  = `${'Quest ID'.padEnd(idWidth)}  ${'Adventure'.padEnd(nameWidth)}  ${'Date'.padEnd(dateWidth)}  Status`;
    const divider = `${'-'.repeat(idWidth)}  ${'-'.repeat(nameWidth)}  ${'-'.repeat(dateWidth)}  ------`;
    const body    = rows.map(r =>
        `${r.questId.padEnd(idWidth)}  ${r.adventureName.padEnd(nameWidth)}  ${r.date.padEnd(dateWidth)}  ${r.status}`
    );

    const table = '```\n' + [header, divider, ...body].join('\n') + '\n```';

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Quest Log - ${charName}`)
        .setDescription(table)
        .setFooter({ text: 'Use /league log quest_id:<id> for details on a specific quest.' })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

// ─── Switch Character ─────────────────────────────────────────────────────

async function handleSwitchButton(interaction) {
    await interaction.deferReply({ flags: 64 });

    let characters;
    try {
        characters = await getCharactersByDiscordId(interaction.user.id);
    } catch (err) {
        console.error('[leagueDashboard] Notion error fetching characters:', err);
        return interaction.editReply({ content: 'Could not reach the database. Please try again.' });
    }

    if (!characters || characters.length === 0) {
        return interaction.editReply({ content: 'You dont have any characters yet. Use /league create to register one.' });
    }

    const others = characters.filter(c => c.properties['Status']?.select?.name !== 'Active');

    if (others.length === 0) {
        return interaction.editReply({ content: 'You dont have any other characters to switch to.' });
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId('leagueDashSwitchSelect')
        .setPlaceholder('Choose a character to make Active')
        .addOptions(others.slice(0, 25).map(c => ({
            label: (c.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown Character').slice(0, 100),
            description: `Status: ${c.properties['Status']?.select?.name ?? 'Unknown'}`.slice(0, 100),
            value: c.id,
        })));

    return interaction.editReply({
        content: 'Which character would you like to make Active?',
        components: [new ActionRowBuilder().addComponents(select)],
    });
}

// ─── Edit Character Details ────────────────────────────────────────────────

async function handleEditButton(interaction) {
    const character = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!character) {
        return interaction.reply({ content: 'You do not have an active character. Use /league create to register one.', flags: 64 });
    }

    const p = character.properties;
    const currentName       = p['Character Name']?.title?.[0]?.plain_text ?? '';
    const currentClass      = p['Class']?.rich_text?.[0]?.plain_text ?? '';
    const currentSpecies    = p['Species']?.rich_text?.[0]?.plain_text ?? '';
    const currentBackground = p['Background']?.rich_text?.[0]?.plain_text ?? '';
    const currentSheetLink  = p['CharSheetLink']?.url ?? '';

    const modal = new ModalBuilder()
        .setCustomId(`leagueDashEditModal:${character.id}`)
        .setTitle('Edit Character Details');

    const fields = [
        { id: 'name',       label: 'Character Name', value: currentName },
        { id: 'class',      label: 'Class',           value: currentClass },
        { id: 'species',    label: 'Species',         value: currentSpecies },
        { id: 'background', label: 'Background',      value: currentBackground },
        { id: 'charsheet',  label: 'Character Sheet Link', value: currentSheetLink },
    ];

    modal.addComponents(fields.map(f => {
        const input = new TextInputBuilder()
            .setCustomId(f.id)
            .setLabel(f.label)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200);
        if (f.value) input.setValue(f.value);
        return new ActionRowBuilder().addComponents(input);
    }));

    await interaction.showModal(modal);
}

// ─── Set Character Art ─────────────────────────────────────────────────────

async function handleSetArtButton(interaction, client) {
    const channel  = interaction.channel;
    const isThread = channel?.isThread?.();
    const parentId = channel?.parentId;

    if (!isThread || parentId !== LEAGUE_PROFILES_FORUM_ID) {
        return interaction.reply({
            content: 'You need to use this inside your character profile thread in the #characters forum. (Try /league dashboard from there instead.)',
            flags: 64,
        });
    }

    const character = await getActiveCharacter(interaction.user.id).catch(() => null);
    if (!character) {
        return interaction.reply({ content: 'You do not have an active character. Use /league create to register one.', flags: 64 });
    }

    await interaction.reply({
        content: 'Upload your character art as an image attachment in this channel within 5 minutes, or type "cancel" to cancel.',
        flags: 64,
    });

    const filter = m => m.author.id === interaction.user.id;
    let collected;
    try {
        collected = await interaction.channel.awaitMessages({ filter, max: 1, time: ART_TIMEOUT_MS, errors: ['time'] });
    } catch {
        return interaction.followUp({ content: 'Timed out waiting for an image. Please try again.', flags: 64 });
    }

    const reply = collected.first();

    if (reply.content.trim().toLowerCase() === 'cancel') {
        try { await reply.delete(); } catch {}
        return interaction.followUp({ content: 'Cancelled.', flags: 64 });
    }

    const attachment = reply.attachments.first();
    if (!attachment) {
        return interaction.followUp({ content: 'No image attachment found. Please run this again and attach an image.', flags: 64 });
    }
    if (!attachment.contentType?.startsWith('image/')) {
        return interaction.followUp({ content: 'That file doesnt look like an image. Please run this again with a PNG, JPG, or GIF.', flags: 64 });
    }
    if (attachment.size > MAX_IMAGE_SIZE) {
        return interaction.followUp({ content: 'Image is too large. Maximum size is 8MB. Please run this again.', flags: 64 });
    }

    const characterName = character.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    let permanentUrl;
    try {
        const archiveThread = await client.channels.fetch(LEAGUE_ART_ARCHIVE_THREAD_ID);
        const archiveMsg = await archiveThread.send({
            content: `${characterName} - <@${interaction.user.id}>`,
            files: [{ attachment: attachment.url, name: attachment.name }],
        });
        permanentUrl = archiveMsg.attachments.first()?.url;
        if (!permanentUrl) throw new Error('No URL returned from archive message');
    } catch (err) {
        console.error('[leagueDashboard setart] Failed to archive image:', err);
        return interaction.followUp({ content: 'Failed to store your image. Please try again.', flags: 64 });
    }

    try {
        await updateCharacterArt(character.id, permanentUrl);
    } catch (err) {
        console.error('[leagueDashboard setart] Notion error updating art:', err);
        return interaction.followUp({ content: 'Failed to save your art. Please try again.', flags: 64 });
    }

    return interaction.followUp({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('Character Art Updated')
                .setDescription([
                    `${characterName}'s profile art has been saved.`,
                    '',
                    'Reminder: AI-generated artwork is not permitted.',
                    'Please credit the original artist wherever possible (e.g. in your thread or on your character sheet).',
                ].join('\n'))
                .setThumbnail(permanentUrl),
        ],
        flags: 64,
    });
}

module.exports = {
    exact: {
        leagueDashProfile: handleProfileButton,
        leagueDashQuests: handleQuestsButton,
        leagueDashDowntimes: handleDowntimeList,
        leagueDashInventory: sendInventory,
        leagueDashBalance: showBalance,
        leagueDashSwitch: handleSwitchButton,
        leagueDashEdit: handleEditButton,
        leagueDashSetArt: handleSetArtButton,
    },
    buildDashboardEmbed,
    buildDashboardRows,
};
