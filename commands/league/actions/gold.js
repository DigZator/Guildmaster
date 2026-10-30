const { EmbedBuilder } = require('discord.js');
const { getActiveCharacter, getCharacterGold, adjustCharacterNumbersUnlocked, withTwoPageLocks } = require('../../../utils/leagueNotion');
const { LEAGUE_ADMIN_CHANNEL_ID } = require('../../../data/channels');
const { formatCurrency } = require('../../../utils/currency');

// ─── /league gold ─────────────────────────────────────────────────────────
async function transferGold(interaction) {
    const targetUser = interaction.options.getUser('player');
    const amount     = interaction.options.getNumber('amount');

    if (targetUser.id === interaction.user.id) {
        return interaction.reply({
            content: '❌ You cannot transfer gold to yourself.',
            flags: 64,
        });
    }

    await interaction.deferReply({ flags: 64 });

    const adminChannelId = LEAGUE_ADMIN_CHANNEL_ID;
    const adminChannel   = interaction.guild.channels.cache.get(adminChannelId);

    let senderChar, receiverChar;
    try {
        [senderChar, receiverChar] = await Promise.all([
            getActiveCharacter(interaction.user.id),
            getActiveCharacter(targetUser.id),
        ]);
    } catch (err) {
        console.error('[gold] Notion error fetching characters:', err);
        return interaction.editReply({ content: '❌ Could not reach the database. Please try again.' });
    }

    if (!senderChar) {
        return interaction.editReply({ content: '❌ You do not have an active character.' });
    }
    if (!receiverChar) {
        return interaction.editReply({ content: `❌ **${targetUser.displayName}** does not have an active character.` });
    }

    const senderName   = senderChar.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';
    const receiverName = receiverChar.properties['Character Name']?.title?.[0]?.plain_text ?? 'Unknown';

    let senderGold, receiverGold;
    let stage = 'none'; // none -> sender_debited -> complete
    try {
        await withTwoPageLocks(senderChar.id, receiverChar.id, async () => {
            [senderGold, receiverGold] = await Promise.all([
                getCharacterGold(senderChar.id),
                getCharacterGold(receiverChar.id),
            ]);

            if (senderGold < amount) throw new Error('INSUFFICIENT_GOLD');

            await adjustCharacterNumbersUnlocked(senderChar.id, { Gold: -amount });
            stage = 'sender_debited';

            await adjustCharacterNumbersUnlocked(receiverChar.id, { Gold: amount });
            stage = 'complete';
        });
    } catch (err) {
        if (err.message === 'INSUFFICIENT_GOLD') {
            return interaction.editReply({
                content: `❌ You do not have enough gold. Current balance: **${formatCurrency(senderGold)}**.`,
            });
        }

        console.error('[gold] Notion error during transfer:', err, { stage });

        let actualSenderGold   = '?';
        let actualReceiverGold = '?';
        try {
            [actualSenderGold, actualReceiverGold] = await Promise.all([
                getCharacterGold(senderChar.id),
                getCharacterGold(receiverChar.id),
            ]);
        } catch (_) {}

        if (adminChannel) {
            await adminChannel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('🚨 Gold Transfer Error')
                        .setDescription(`A gold transfer failed mid-execution at stage \`${stage}\`. Manual review may be required.`)
                        .addFields(
                            { name: 'Sender',               value: `<@${interaction.user.id}> (${senderName})`,  inline: true },
                            { name: 'Receiver',             value: `<@${targetUser.id}> (${receiverName})`,      inline: true },
                            { name: 'Amount',               value: `${formatCurrency(amount)}`,                               inline: true },
                            { name: 'Sender Before',        value: `${formatCurrency(senderGold ?? '?')}`,                    inline: true },
                            { name: 'Receiver Before',      value: `${formatCurrency(receiverGold ?? '?')}`,                  inline: true },
                            { name: '\u200b',               value: '\u200b',                                     inline: true },
                            { name: 'Sender After (actual)',   value: `${formatCurrency(actualSenderGold)}`,                  inline: true },
                            { name: 'Receiver After (actual)', value: `${formatCurrency(actualReceiverGold)}`,                inline: true },
                            { name: 'Was Receiver Credited?', value: stage === 'complete' ? 'Yes' : 'No — sender was debited but receiver was not yet credited', inline: true },
                            { name: 'Error',                value: `\`${err.message}\``,                         inline: false },
                        )
                        .setTimestamp(),
                ],
            });
        }

        return interaction.editReply({
            content: '❌ The transfer failed partway through. Admins have been notified to review the balances.',
        });
    }

    const newSenderGold   = senderGold   - amount;
    const newReceiverGold = receiverGold + amount;

    if (adminChannel) {
        await adminChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xffd700)
                    .setTitle('💰 Gold Transfer')
                    .addFields(
                        { name: 'From',   value: `<@${interaction.user.id}> (${senderName})`,                    inline: true },
                        { name: 'To',     value: `<@${targetUser.id}> (${receiverName})`,                        inline: true },
                        { name: 'Amount', value: `${formatCurrency(amount)}`,                                                 inline: true },
                        { name: `${senderName} Balance`,   value: `${formatCurrency(senderGold)} → ${formatCurrency(newSenderGold)}`,     inline: true },
                        { name: `${receiverName} Balance`, value: `${formatCurrency(receiverGold)} → ${formatCurrency(newReceiverGold)}`, inline: true },
                    )
                    .setTimestamp(),
            ],
        });
    }

    return interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('💰 Gold Transferred')
                .setDescription(`Successfully sent **${formatCurrency(amount)}** to **${receiverName}**.`)
                .addFields(
                    { name: 'Your new balance', value: `${formatCurrency(newSenderGold)}`, inline: true },
                )
                .setTimestamp(),
        ],
    });
}

// ─── /league balance ─────────────────────────────────────────────────────────
async function showBalance(interaction) {
	await interaction.deferReply({ flags: 64 });

	const char = await getActiveCharacter(interaction.user.id);
	if (!char) {
		return interaction.editReply({ content: '❌ No active character found.' });
	}

	const p = char.properties;
	const name        = p['Character Name'].title[0]?.plain_text ?? 'Unknown';
	const gold        = p['Gold'].number ?? 0;
	const rep         = p['Reputation Points'].number ?? 0;
	const milestones  = p['Milestones'].number ?? 0;

	const embed = new EmbedBuilder()
		.setTitle(`${name}'s Balance`)
		.addFields(
			{ name: '💰 Gold',             value: `${formatCurrency(gold)}`,        inline: true },
			{ name: '⭐ Reputation',        value: `${rep} pts`,        inline: true },
			{ name: '🏆 Milestones',        value: `${milestones}`,     inline: true },
		)
		.setColor(0xF1C40F);

	return interaction.editReply({ embeds: [embed] });
}

module.exports = {
    transferGold,
    showBalance,
};
