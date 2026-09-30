const { EmbedBuilder } = require('discord.js');
const memorialDrafts = require('../utils/memorialDrafts');
const { THE_LONG_REST_CHANNEL_ID } = require('../data/channels');
const { buildPreviewButtons } = require('../utils/memorialButtons');
const {
    FIELD_VALUE_MAX,
    TITLE_MAX,
    EMBED_TOTAL_MAX,
    clip,
    safe,
    longTextFields,
    embedSize,
} = require('../utils/memorialEmbed');

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
    // storedData.name only exists on the part-1 draft; once part 2 is done the
    // draft is replaced by the preview record, so a stale button lands here too.
    if (!storedData || !storedData.name) {
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

    // Build embed. Discord rejects field values over 1024 characters and embeds
    // over 6000 characters combined, so long text is split across fields and the
    // total is checked. Anything thrown here must be reported — the reply is
    // already deferred, so an uncaught error would leave the user on "thinking…".
    let embed;
    try {
        embed = new EmbedBuilder()
            .setTitle(clip(safe(storedData.name), TITLE_MAX))
            .setImage(portraitURL)
            .setColor(embedColor)
            .addFields(
                { name: 'Species', value: clip(safe(storedData.species), FIELD_VALUE_MAX), inline: true },
                { name: 'Class/Subclass', value: clip(safe(storedData.class), FIELD_VALUE_MAX), inline: true },
                { name: 'Aliases', value: clip(safe(storedData.aliases), FIELD_VALUE_MAX), inline: false },
                { name: 'Faction', value: clip(safe(storedData.faction), FIELD_VALUE_MAX), inline: true },
                ...longTextFields('Backstory', backstory),
                ...longTextFields('Manner of Death', mannerOfDeath),
                { name: 'Campaign', value: clip(safe(campaign), FIELD_VALUE_MAX), inline: false }
            )
            .setFooter({ text: `Submitted by ${interaction.user.tag} | AuthorID: ${interaction.user.id}` })
            .setTimestamp();

        const size = embedSize(embed);
        if (size > EMBED_TOTAL_MAX) {
            await interaction.editReply({
                content: `❌ Your submission is too long for Discord (${size} of ${EMBED_TOTAL_MAX} characters). Please shorten the backstory or manner of death and start over.`,
                flags: 64
            });
            return;
        }
    } catch (err) {
        console.error('[characterSubmission_2] Failed to build the memorial embed:', err);
        await interaction.editReply({
            content: '❌ Something went wrong building your preview. Please check your details and start over.',
            flags: 64
        });
        return;
    }

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
        components: [buildPreviewButtons()]
    });
};
