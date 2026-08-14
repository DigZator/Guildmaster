const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const memorialDrafts = require('../utils/memorialDrafts');
const { THE_LONG_REST_CHANNEL_ID } = require('../data/channels');

const previewButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId('memorial_preview_confirm')
        .setLabel("Submit")
        .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
        .setCustomId('memorial_preview_cancel')
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
)

async function validateImageURL(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        let res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });

        if (!res.ok || !res.headers.get('content-type')) {
            res = await fetch(url, {
                method: 'GET',
                headers: { Range: 'bytes=0-1024' },
                signal: controller.signal,
                redirect: 'follow'
            });
        }

        if (!res.ok) return { valid: false, reason: `URL returned status ${res.status}.` };

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return { valid: false, reason: `URL does not point to an image (got "${contentType || 'unknown'}").` };
        }

        return { valid: true };
    } catch (err) {
        if (err.name === 'AbortError') return { valid: false, reason: 'URL took too long to respond.' };
        return { valid: false, reason: 'Could not reach that URL.' };
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = async (interaction, client) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== "characterSubmission_2") return;

    await interaction.deferReply({ flags: 64 });

    const storedData = memorialDrafts.get(interaction.user.id);
    if (!storedData) {
        await interaction.editReply({
            content: "Error: Your session expired. Please start over.",
            flags: 64
        });
        return;
    }

    const backstory = interaction.fields.getTextInputValue('backstory');
    const mannerOfDeath = interaction.fields.getTextInputValue('mannerOfDeath');
    const campaign = interaction.fields.getTextInputValue('campaign') || 'N/A';
    const portraitURL = interaction.fields.getTextInputValue('portraitURL');
    const embedColorInput = interaction.fields.getTextInputValue('embedColor');

    const imageCheck = await validateImageURL(portraitURL);
    if (!imageCheck.valid) {
        await interaction.editReply({
            content: `❌ **Portrait URL is invalid:** ${imageCheck.reason}\n\nPlease start over with a direct link to an image (e.g. ending in .png/.jpg, or a Discord CDN link).`,
            flags: 64
        });
        return;
    }

    let embedColor = 0xFFFFFF;

    if (embedColorInput) {
        const cleanColor = embedColorInput.replace('#', '');
        const parsedColor = parseInt(cleanColor, 16);
        if (!Number.isNaN(parsedColor) && /^[0-9a-fA-F]{6}$/.test(cleanColor)) {
            embedColor = parsedColor;
        } else {
            console.log('Invalid color format, using default');
        }
    }

    const outputChannel = interaction.guild.channels.cache.get(THE_LONG_REST_CHANNEL_ID);

    if (!outputChannel) {
        await interaction.editReply({
            content: 'Output channel not found. Contact an admin.',
            flags: 64
        });
        return;
    }

    // Build embed
    const embed = new EmbedBuilder()
        .setTitle(storedData.name)
        .setImage(portraitURL)
        .setColor(embedColor)
        .addFields(
            { name: 'Species', value: storedData.species, inline: true },
            { name: 'Class/Subclass', value: storedData.class, inline: true },
            { name: 'Aliases', value: storedData.aliases, inline: false },
            { name: 'Faction', value: storedData.faction, inline: true },
            { name: 'Backstory', value: backstory, inline: false },
            { name: 'Manner of Death', value: mannerOfDeath, inline: false },
            { name: 'Campaign', value: campaign, inline: false }
        )
        .setFooter({ text: `Submitted by ${interaction.user.tag} | AuthorID: ${interaction.user.id}` })
        .setTimestamp();

    memorialDrafts.set(
        interaction.user.id, {
            embed,
            storedData,
            portraitURL,
            embedColor
        }
    )

    await interaction.editReply({
        content: 'Here’s a preview of your submission. Please confirm:',
        embeds: [embed],
        components: [previewButtons]
    });
};
