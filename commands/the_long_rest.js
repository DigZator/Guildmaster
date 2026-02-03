const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = async (interaction, client) => {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    try {
        if (subcommand === 'add') {

            if (interaction.channel.name !== 'tlr-submission') {
                await interaction.reply({
                    content: 'This command can only be used in the `tlr-submission` channel.',
                    flags: 64
                });
                return;
            }

            const outputChannel = interaction.guild.channels.cache.find(
                channel => channel.name === 'the-long-rest'
            );

            if (!outputChannel) {
                await interaction.reply({
                    content: 'Output channel not found. Contact an admin.',
                    flags: 64
                });
                return;
            }

            // Modal 1 for character submission
            const modal_1 = new ModalBuilder()
                .setCustomId('characterSubmission_1')
                .setTitle('Character Memorial Submission - 1/2');

            const characterNameInput = new TextInputBuilder()
                .setCustomId('characterName')
                .setLabel("Character Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const speciesInput = new TextInputBuilder()
                .setCustomId('species')
                .setLabel("Species")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const classInput = new TextInputBuilder()
                .setCustomId('class')
                .setLabel("Class/Subclass")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const aliasesInput = new TextInputBuilder()
                .setCustomId('aliases')
                .setLabel("Aliases (optional)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const factionInput = new TextInputBuilder()
                .setCustomId('faction')
                .setLabel("Faction/Affiliation (optional)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal_1.addComponents(
                new ActionRowBuilder().addComponents(characterNameInput),
                new ActionRowBuilder().addComponents(speciesInput),
                new ActionRowBuilder().addComponents(classInput),
                new ActionRowBuilder().addComponents(aliasesInput),
                new ActionRowBuilder().addComponents(factionInput)
            );

            await interaction.showModal(modal_1);
            return;
        }

        if (subcommand === 'remove') {
            const allowedChannel = ['tlr-submission', 'tlr-control'];
            if (!allowedChannel.includes(interaction.channel.name)) {
                await interaction.reply({
                    content: 'This command can only be used in the `tlr-submission` channel.',
                    flags: 64
                });
                return;
            }
            await interaction.deferReply({flags: 64});
            const messageId = interaction.options.getString('message_id');


            if (!/^\d{17,19}$/.test(messageId)) {
                await interaction.editReply({
                    content: '❌ Invalid message ID format.'
                });
                return;
            }
            
            const outputChannel = interaction.guild.channels.cache.find(
                channel => channel.name === 'the-long-rest'
            );

            if (!outputChannel) {
                await interaction.editReply({
                    content: 'Output channel not found. Contact an admin.'
                });
                return;
            }

            let message;
            try {
                message = await outputChannel.messages.fetch(messageId);
                if (!message.embeds || message.embeds.length === 0) {
                    await interaction.editReply({
                        content: 'The specified message is not a memorial.'
                    });
                    return;
                }
            } catch (fetchError) {
                console.error('Error fetching message:', fetchError);
                await interaction.editReply({
                    content: 'Could not find a message with that ID in the output channel.'
                });
                return;
            }

            const member = interaction.member;

            const footerText = message.embeds[0]?.footer?.text || '';
            const authorIdMatch = footerText.match(/AuthorID:\s*(\d{17,19})/);
            const authorId = authorIdMatch ? authorIdMatch[1] : null;

            const isAuthor = authorId === interaction.user.id;

            const allowedRoleRemove = ['Mods', 'Clerk of Mortal Affairs'];
            const isAdmin = member.roles.cache.some(
                role => allowedRoleRemove.includes(role.name)
            );

            if (!isAuthor && !isAdmin) {
                await interaction.editReply({
                    content: 'You do not have permission to remove this memorial.'
                });
                return;
            }

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_remove_${messageId}`)
                    .setLabel('Confirm Delete')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`cancel_remove_${messageId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

            const characterName = message.embeds[0]?.title || 'Unknown Character';
            const timestamp = message.createdAt.toLocaleString('en-GB',{
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            await interaction.editReply({
                content: `⚠️ **Confirm Deletion**\n\n` +
                            `**Character:** ${characterName}\n` +
                            `**Posted on:** ${timestamp}\n\n` +
                            `This action cannot be undone.`,
                components: [confirmRow]
            });
        }
    } catch (error) {
        console.error('Error handling The Long Rest command:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'There was an error while executing this command!',
                flags: 64
            });
        }
    }
};
