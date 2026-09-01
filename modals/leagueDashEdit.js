const { EmbedBuilder } = require('discord.js');
const { getPageById, updatePageProperty } = require('../utils/leagueNotion');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../data/channels');

module.exports = async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('leagueDashEditModal:')) return;

    const characterId = interaction.customId.split(':')[1];

    await interaction.deferReply({ flags: 64 });

    let character;
    try {
        character = await getPageById(characterId);
    } catch (err) {
        console.error('[leagueDashEdit] Notion error fetching character:', err);
        return interaction.editReply({ content: 'Could not reach the database. Please try again.' });
    }

    const ownerDiscordId = character?.properties?.['Discord ID']?.rich_text?.[0]?.plain_text ?? null;
    if (!character || ownerDiscordId !== interaction.user.id) {
        return interaction.editReply({ content: 'That character was not found among your own characters.' });
    }

    const name          = interaction.fields.getTextInputValue('name').trim();
    const classLevels   = interaction.fields.getTextInputValue('class').trim();
    const species       = interaction.fields.getTextInputValue('species').trim();
    const background    = interaction.fields.getTextInputValue('background').trim();
    const charSheetLink = interaction.fields.getTextInputValue('charsheet').trim();

    if (charSheetLink && !/^https?:\/\//i.test(charSheetLink)) {
        return interaction.editReply({ content: 'Character Sheet Link must be a valid URL starting with http:// or https://. No changes were saved — please run this again.' });
    }

    const p = character.properties;
    const updates = {};
    const changeLines = [];

    if (name && name !== (p['Character Name']?.title?.[0]?.plain_text ?? '')) {
        updates['Character Name'] = { title: [{ text: { content: name } }] };
        changeLines.push(`**Name:** ${p['Character Name']?.title?.[0]?.plain_text ?? '—'} → ${name}`);
    }
    if (classLevels && classLevels !== (p['Class']?.rich_text?.[0]?.plain_text ?? '')) {
        updates['Class'] = { rich_text: [{ text: { content: classLevels } }] };
        changeLines.push(`**Class:** ${p['Class']?.rich_text?.[0]?.plain_text ?? '—'} → ${classLevels}`);
    }
    if (species && species !== (p['Species']?.rich_text?.[0]?.plain_text ?? '')) {
        updates['Species'] = { rich_text: [{ text: { content: species } }] };
        changeLines.push(`**Species:** ${p['Species']?.rich_text?.[0]?.plain_text ?? '—'} → ${species}`);
    }
    if (background && background !== (p['Background']?.rich_text?.[0]?.plain_text ?? '')) {
        updates['Background'] = { rich_text: [{ text: { content: background } }] };
        changeLines.push(`**Background:** ${p['Background']?.rich_text?.[0]?.plain_text ?? '—'} → ${background}`);
    }
    if (charSheetLink && charSheetLink !== (p['CharSheetLink']?.url ?? '')) {
        updates['CharSheetLink'] = { url: charSheetLink };
        changeLines.push(`**Sheet Link:** ${charSheetLink}`);
    }

    if (changeLines.length === 0) {
        return interaction.editReply({ content: 'No changes detected.' });
    }

    try {
        await updatePageProperty(character.id, updates);
    } catch (err) {
        console.error('[leagueDashEdit] Notion error updating character:', err);
        return interaction.editReply({ content: 'Failed to save your changes. Please try again.' });
    }

    const characterName = name || (p['Character Name']?.title?.[0]?.plain_text ?? 'Unknown');

    const adminChannel = interaction.guild.channels.cache.get(LEAGUE_ADMIN_CHANNEL_ID);
    if (adminChannel) {
        await adminChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffa500)
                    .setTitle('📝 Character Edit Log')
                    .setDescription(changeLines.join('\n'))
                    .addFields(
                        { name: 'Character', value: characterName, inline: true },
                        { name: 'Player', value: `<@${interaction.user.id}>`, inline: true },
                    )
                    .setTimestamp(),
            ],
        }).catch(() => console.warn('[leagueDashEdit] Failed to send admin log.'));
    }

    return interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Character Updated')
                .setDescription(changeLines.join('\n'))
                .setTimestamp(),
        ],
    });
};
