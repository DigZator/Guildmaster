const { fetchGameByUID } = require('../utils/notion');
const { EmbedBuilder } = require('discord.js');

module.exports = async (interaction, client) => {
    const uid = interaction.options.getString('uid');
    const isPublic = interaction.options.getBoolean('public') ?? false;

    await interaction.deferReply({ flags: isPublic ? 0 : 64 });

    try {
        const game = await fetchGameByUID(uid);

        if (!game) {
            await interaction.editReply({ content: '❌ Game not found. Check the UID and try again.' });
            return;
        }

        const seatsLeft = game.openSeats !== undefined ? game.openSeats : 'N/A';

        const formattedBlurb = game.blurb.length > 4000
            ? game.blurb.slice(0, 3997) + '... [truncated]'
            : game.blurb;

        const blurb = formattedBlurb
            .split('\n')
            .map(line => line.trim() ? `_${line.trim()}_` : '')
            .join('\n');

        const section1 = [
            `**${game.format} ${game.type}** for *${game.experienceLevel}*`,
            `**${game.date}**`,
            `**${game.time}**`,
            ``,
            blurb
        ].join('\n');

        const section2 = [
            `**Content Warnings:** ${game.warnings || 'None'}`,
            ``,
            `**DM:** ${game.dm || '-'}`,
            `**System:** ${game.system || '-'}`,
            `**Level:** ${game.level === '0' ? 'N/A' : game.level}`,
            `**Classes Allowed:** ${game.classes || '-'}`,
            `**Species Allowed:** ${game.species || '-'}`,
        ].join('\n');

        const section3Parts = [`**Other Notes:**`];
        if (game.notes) {
            game.notes.split('\n').forEach(line => {
                if (line.trim()) {
                    const cleaned = line.trim().replace(/^[-•]\s*/, '');
                    section3Parts.push(`- ${cleaned}`);
                }
            });
        } else {
            section3Parts.push('-');
        }

        const section4 = [
            `**Session Type:** ${game.format} ${game.type}`,
            `**Venue:** ${game.location || 'TBD'}`,
            `**Cost:** ${game.price === 'Free' ? 'FREE' : game.price}`,
            `**Date:** ${game.date}`,
            `**Time:** ${game.time}`,
            `**Seats:** ${seatsLeft}/${game.seats} remaining`,
        ].join('\n');

        const section5 = game.registrationLink
            ? `**!! Register by clicking the link below !!**\n${game.registrationLink}`
            : `**!! Register by clicking the link below !!**\nhttps://adventuringguildmumbai.fillout.com/player-sign-up`;

        const embed = new EmbedBuilder()
            .setTitle(game.title.trim())
            .setColor(0x5865F2)
            .addFields(
                { name: '\u200B', value: section1, inline: false },
                { name: '\u200B', value: section2, inline: false },
                { name: '\u200B', value: section3Parts.join('\n'), inline: false },
                { name: '\u200B', value: section4, inline: false },
                { name: '\u200B', value: section5, inline: false },
            )
            .setFooter({ text: `Art: ${game.artist || 'N/A'} • UID: ${game.uid}` });

        if (game.artURL) embed.setImage(game.artURL);

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('game_info error:', error);
        await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
    }
};