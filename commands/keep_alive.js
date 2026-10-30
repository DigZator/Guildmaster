const keepAliveStore = require('../utils/keepAliveStore');
const { KEEP_ALIVE_DURATION, missingPermissions, sendToCtrl } = require('../utils/keepAlive');

const EPHEMERAL = 64;

module.exports = async (interaction, client) => {
    const thread = interaction.channel;

    if (!thread || !thread.isThread()) {
        return interaction.reply({ content: '❌ `/keep_alive` can only be used inside a thread.', flags: EPHEMERAL });
    }

    const enabling = !keepAliveStore.has(thread.id);

    if (enabling) {
        const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        const missing = missingPermissions(thread, me);
        if (missing.length) {
            await sendToCtrl(client,
                `🚨 **Keep Alive could not be enabled** in <#${thread.id}> (parent: ${thread.parentId ? `<#${thread.parentId}>` : 'unknown'}).\n` +
                `Requested by <@${interaction.user.id}>. The bot is missing: **${missing.join(', ')}**.\n` +
                `Grant these to the bot in that channel, then ask the user to run \`/keep_alive\` again.`
            );
            return interaction.reply({
                content:
                    `❌ I can't enable Keep Alive here because I'm missing permissions in this thread: **${missing.join(', ')}**.\n` +
                    `Please contact an admin — I've already notified them with the details.`,
                flags: EPHEMERAL,
            });
        }
    }

    await interaction.deferReply({ flags: EPHEMERAL });

    try {
        if (enabling) {
            if (thread.autoArchiveDuration !== KEEP_ALIVE_DURATION) {
                await thread.setAutoArchiveDuration(KEEP_ALIVE_DURATION, 'Keep Alive enabled');
            }

            const result = keepAliveStore.add({
                threadId: thread.id,
                guildId: interaction.guild.id,
                addedBy: interaction.user.id,
            });
            if (result.error) throw new Error(result.error);

            let noticePosted = true;
            try {
                await thread.send({
                    content: `📌 <@${interaction.user.id}> has enabled the **Keep Alive** feature on this thread. This thread won't be archived due to inactivity.`,
                    allowedMentions: { parse: [] },
                });
            } catch (err) {
                noticePosted = false;
                console.error('[keep_alive] Could not post the enable notice:', err);
                await sendToCtrl(client, `⚠️ Keep Alive was enabled in <#${thread.id}> by <@${interaction.user.id}>, but the public notice could not be posted (${String(err.message).slice(0, 150)}).`);
            }

            return interaction.editReply({
                content: noticePosted
                    ? '✅ Keep Alive enabled. This thread will no longer archive due to inactivity.'
                    : '✅ Keep Alive enabled, but I couldn\'t post the notice in the thread. An admin has been informed.',
            });
        }

        keepAliveStore.remove(thread.id);

        try {
            await thread.send({
                content: `📌 <@${interaction.user.id}> has disabled the **Keep Alive** feature on this thread. It will archive normally after inactivity again.`,
                allowedMentions: { parse: [] },
            });
        } catch (err) {
            console.error('[keep_alive] Could not post the disable notice:', err);
        }

        return interaction.editReply({ content: '✅ Keep Alive disabled. This thread will archive normally again.' });
    } catch (err) {
        console.error('[keep_alive] Command failed:', err);
        await sendToCtrl(client,
            `🚨 **/keep_alive failed** in <#${thread.id}> for <@${interaction.user.id}>: ${String(err.message).slice(0, 300)}`
        );
        return interaction.editReply({ content: '❌ Something went wrong while toggling Keep Alive. An admin has been informed.' });
    }
};
