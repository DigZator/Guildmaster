module.exports = (client) => {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isModalSubmit()) return;
        try {
            let handled = true;

            if (interaction.customId === 'characterSubmission_1') {
                await require('../modals/characterSubmission_1')(interaction, client);
            } else if (interaction.customId === 'characterSubmission_2') {
                await require('../modals/characterSubmission_2')(interaction, client);
            } else if (interaction.customId === 'leagueCreate') {
                const { handleLeagueCreate } = require('./leagueCreateModal');
                await handleLeagueCreate(interaction, client);
            } else if (interaction.customId.startsWith('editgame_modal_')) {
                await require('../modals/editGameModal')(interaction, client);
            } else if (interaction.customId.startsWith('announceedit_modal_')) {
                await require('../modals/announceEditModal')(interaction, client);
            } else if (interaction.customId.startsWith('questDash:')) {
                await require('../buttons/questDashboard').handleDashboardModal(interaction);
            } else if (interaction.customId.startsWith('ticketCreateModal:') || interaction.customId.startsWith('ticket:')) {
                const result = await require('../buttons/ticket').handleTicketModal(interaction);
                if (result === false) handled = false;
            } else if (interaction.customId.startsWith('leagueDashEditModal:')) {
                await require('../modals/leagueDashEdit')(interaction, client);
            } else if (interaction.customId === 'tlrRemoveModal') {
                await require('../buttons/theLongRest').handleRemoveModalSubmit(interaction);
            } else {
                handled = false;
            }

            if (!handled) {
                console.warn(`[modalHandler] Unhandled modal submission: ${interaction.customId}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ This form isn\'t wired up yet.', flags: 64 });
                }
            }
        } catch (error) {
            if (error.code === 10062) {
                console.warn(`[modalHandler] Interaction expired before we could respond: ${interaction.customId}`);
                return;
            }
            console.error('Error handling modal:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'There was an error processing your submission!',
                        flags: 64
                    });
                }
            } catch (replyError) {
                console.warn('[modalHandler] Fallback reply also failed:', replyError.message);
            }
        }
    });
};
