const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const memorialDrafts = require('../utils/memorialDrafts');
const memorialIndex = require('../utils/memorialIndex');
const { reportError } = require('../utils/errorReporter');
const { THE_LONG_REST_CHANNEL_ID, TLR_CONTROL_CHANNEL_ID } = require('../data/channels');
const { TLR_MOD_PING_ROLE_ID } = require('../config/tlrRoles');
const { tryAcquire, release } = require('../utils/interactionLock');
const { buildPreviewButtons, buildModButtons } = require('../utils/memorialButtons');
const { MEMORIAL_LIMITS } = require('../utils/memorialEmbed');

const HOLD_MS = 5 * 60 * 1000;

const PREVIEW_PROMPT = 'Here’s a preview of your submission. Please confirm:';

function getSubmitterIdFromEmbed(embed) {
    const footerText = embed?.footer?.text || '';
    const match = footerText.match(/AuthorID:\s*(\d{17,19})/);
    return match ? match[1] : null;
}

// ─── Small helpers ──────────────────────────────────────────────────────────

async function ackSilently(interaction) {
    try { await interaction.deferUpdate(); } catch {  }
}

async function tellEphemeral(interaction, content) {
    try {
        await interaction.followUp({ content, flags: 64 });
    } catch (err) {
        console.warn('[Memorial] Could not send follow-up:', err.message);
    }
}

async function restorePreview(interaction, errorText) {
    try {
        await interaction.editReply({ content: PREVIEW_PROMPT, components: [buildPreviewButtons()] });
    } catch (err) {
        console.warn('[Memorial] Could not restore the preview buttons:', err.message);
    }
    await tellEphemeral(interaction, errorText);
}

async function restoreModButtons(interaction, errorText) {
    try {
        await interaction.editReply({ components: [buildModButtons()] });
    } catch (err) {
        console.warn('[Memorial] Could not restore the mod buttons:', err.message);
    }
    await tellEphemeral(interaction, errorText);
}

// ─── Approve ────────────────────────────────────────────────────────────────

async function approveMemorial(interaction, client, markPosted) {
    const modData = interaction.message.embeds[0];
    if (!modData) {
        await restoreModButtons(interaction, '❌ This message has no memorial embed to post.');
        return;
    }

    const outputChannel = interaction.guild.channels.cache.get(THE_LONG_REST_CHANNEL_ID);
    if (!outputChannel) {
        await restoreModButtons(interaction, '❌ Output channel not found. Contact an admin.');
        return;
    }

    const characterName = modData.title || 'Character';
    const submitterId = getSubmitterIdFromEmbed(modData);

    let sentMessage;
    try {
        sentMessage = await outputChannel.send({ embeds: [modData] });
    } catch (err) {
        console.error('[Memorial] Failed to post the approved memorial:', err);
        await restoreModButtons(interaction, `❌ Couldn't post the memorial: ${err.message}\nNothing was posted — you can click Approve again.`);
        return;
    }

    markPosted();

    const problems = [];

    try {
        memorialIndex.addEntry({
            messageId: sentMessage.id,
            authorId: submitterId,
            characterName,
            postedAt: Date.now(),
        });
    } catch (err) {
        problems.push('index entry');
        await reportError(client, {
            scope: '[Memorial]',
            message: `Could not save index entry for "${characterName}"`,
            error: err,
            context: { messageId: sentMessage.id, submitterId },
        });
    }

    let thread = null;
    try {
        thread = await sentMessage.startThread({ name: `${characterName} Memorial`.slice(0, 100), autoArchiveDuration: 1440 });
    } catch (err) {
        problems.push('thread');
        console.error('[Memorial] Could not start the memorial thread:', err);
    }

    for (const emoji of ['🕯️', '🕊️', '❤️']) {
        try {
            await sentMessage.react(emoji);
        } catch (err) {
            problems.push('reactions');
            console.error('[Memorial] Could not add reactions:', err);
            break;
        }
    }

    if (thread) {
        try {
            await thread.send(`🕯️ **In Memory of ${characterName}** 🕊️\n\nShare memories, stories, or pay your respects here.`);
            await thread.send(`||If the creator of a character wishes for that character to be revived or reused by other players, they may share the character sheet here. If no character sheet is provided below, please respect the creator's wishes and do not revive or reuse the character.||`);
        } catch (err) {
            problems.push('thread messages');
            console.error('[Memorial] Could not post the thread messages:', err);
        }
    }

    if (submitterId) memorialDrafts.delete(submitterId);

    let content = '✅ Memorial approved and posted to The Long Rest channel.';
    if (!submitterId) content += '\n⚠️ Could not identify the submitter to notify them.';
    if (problems.length) content += `\n⚠️ Posted, but these steps failed: ${[...new Set(problems)].join(', ')} — finish them manually.`;

    try {
        await interaction.editReply({ content, components: [] });
    } catch (err) {
        console.warn('[Memorial] Could not update the mod message after approval:', err.message);
    }

    if (submitterId) {
        try {
            const submitter = await client.users.fetch(submitterId);
            await submitter.send(`✅ Your character memorial submission for **${characterName}** was approved and posted to The Long Rest channel: ${sentMessage.url}`);
        } catch (err) {
            await reportError(client, {
                scope: '[Memorial]',
                message: `Could not DM approval to submitter for "${characterName}"`,
                error: err,
                context: { submitterId, characterName },
            });
        }
    }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

module.exports = {

    exact: {

        continue_memorial_part2: async (interaction) => {
            const modal = new ModalBuilder()
                .setCustomId('characterSubmission_2')
                .setTitle('Character Memorial Submission - 2/2');

            const fields = [
                { id: 'backstory',     label: 'Character Backstory',             style: TextInputStyle.Paragraph, required: true,  max: MEMORIAL_LIMITS.backstory },
                { id: 'mannerOfDeath', label: 'Manner of Death',                 style: TextInputStyle.Paragraph, required: true,  max: MEMORIAL_LIMITS.manner },
                { id: 'campaign',      label: 'Adventure Name (optional)',       style: TextInputStyle.Short,     required: false, max: MEMORIAL_LIMITS.campaign },
                { id: 'portraitURL',   label: 'Portrait Image URL',              style: TextInputStyle.Short,     required: true,  max: MEMORIAL_LIMITS.portrait },
                { id: 'embedColor',    label: 'Embed Color (hex, e.g. #FFFFFF)', style: TextInputStyle.Short,     required: false, max: 7 },
            ];

            modal.addComponents(fields.map(f =>
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(f.id)
                        .setLabel(f.label)
                        .setStyle(f.style)
                        .setRequired(f.required)
                        .setMaxLength(f.max)
                )
            ));

            await interaction.showModal(modal);
        },

        memorial_preview_confirm: async (interaction) => {
            const key = `submit:${interaction.user.id}`;
            if (!tryAcquire(key)) return ackSilently(interaction);   // duplicate click — ignore

            let submitted = false;
            try {
                await interaction.update({ content: '⏳ Submitting…', components: [] });

                const storedData = memorialDrafts.get(interaction.user.id);
                if (!storedData?.embed) {
                    await interaction.editReply({ content: '❌ Session expired. Please start over.', embeds: [], components: [] });
                    return;
                }

                const outputChannel = interaction.guild.channels.cache.get(TLR_CONTROL_CHANNEL_ID);
                if (!outputChannel) {
                    await restorePreview(interaction, '❌ Mod channel not found. Contact an admin.');
                    return;
                }

                const ping = TLR_MOD_PING_ROLE_ID ? `<@&${TLR_MOD_PING_ROLE_ID}> ` : '';
                try {
                    await outputChannel.send({
                        content: `${ping}New memorial submission from <@${interaction.user.id}>:`,
                        embeds: [storedData.embed],
                        components: [buildModButtons()],
                    });
                } catch (err) {
                    console.error('[Memorial] Failed to send the submission to the mod channel:', err);
                    await restorePreview(interaction, `❌ Couldn't submit your memorial: ${err.message}\nNothing was sent — you can press Submit again.`);
                    return;
                }

                submitted = true;
                // Only now do we tell the player it worked.
                await interaction.editReply({ content: '✅ Submitted for moderator review.', components: [] })
                    .catch(err => console.warn('[Memorial] Could not confirm submission to the player:', err.message));
            } finally {
                release(key, submitted ? { holdMs: HOLD_MS } : {});
            }
        },

        memorial_preview_cancel: async (interaction) => {
            await interaction.deferUpdate();
            memorialDrafts.delete(interaction.user.id);
            try { await interaction.message.delete(); } catch {  }
            await interaction.editReply({ content: '❌ Submission cancelled. You can start over anytime.', flags: 64 });
        },

        // Mod clicks Approve.
        memorial_mod_approve: async (interaction, client) => {
            const key = `mod:${interaction.message.id}`;   // shared with Deny, so the two can't both run
            if (!tryAcquire(key)) return ackSilently(interaction);

            let posted = false;
            try {
                await interaction.update({ components: [] });   // remove Approve/Deny immediately
                await approveMemorial(interaction, client, () => { posted = true; });
            } catch (err) {
                console.error('[Memorial] Approve failed unexpectedly:', err);
                if (!posted) {
                    await restoreModButtons(interaction, '❌ Something went wrong before the memorial was posted. Nothing was posted — you can try again.');
                } else {
                    await tellEphemeral(interaction, '⚠️ The memorial was posted, but something went wrong afterwards. Check The Long Rest channel before doing anything else.');
                }
            } finally {
                release(key, posted ? { holdMs: HOLD_MS } : {});
            }
        },

        memorial_mod_deny: async (interaction, client) => {
            const key = `mod:${interaction.message.id}`;
            if (!tryAcquire(key)) return ackSilently(interaction);

            let done = false;
            try {
                await interaction.update({ components: [] });

                const modData = interaction.message.embeds[0];
                const submitterId = getSubmitterIdFromEmbed(modData);
                if (submitterId) memorialDrafts.delete(submitterId);

                await interaction.editReply({
                    content: `❌ Memorial denied by <@${interaction.user.id}>.\n\n` +
                             (submitterId ? `The submitter <@${submitterId}> has been notified.` : '⚠️ Could not identify the submitter to notify them.'),
                    components: [],
                });
                done = true;

                if (submitterId) {
                    try {
                        const submitter = await client.users.fetch(submitterId);
                        await submitter.send('❌ Your character memorial submission was not approved by the moderators.\n\nIf you have questions, please contact a moderator.');
                    } catch (err) {
                        await reportError(client, {
                            scope: '[Memorial]',
                            message: 'Could not DM denial to submitter',
                            error: err,
                            context: { submitterId },
                        });
                    }
                }
            } catch (err) {
                console.error('[Memorial] Deny failed unexpectedly:', err);
                if (!done) {
                    await restoreModButtons(interaction, '❌ Something went wrong while denying. Nothing was changed — you can try again.');
                }
            } finally {
                release(key, done ? { holdMs: HOLD_MS } : {});
            }
        },
    }
};
