const {
    ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, TextDisplayBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const store = require('../utils/verificationStore');
const log = require('../utils/verificationLog');
const service = require('../utils/verificationService');
const { getConfig } = require('../config/verificationConfig');
const { generateProblem, parseAnswer } = require('../utils/verificationProblems');
const { tryAcquire, release } = require('../utils/interactionLock');
const { isVerificationAdmin } = require('../utils/verificationAdmin');
const { buildPendingPage, PAGER_PREFIX } = require('../utils/verificationPending');
const { reportError } = require('../utils/errorReporter');

const START_ID = 'verification:start';
const RETRY_ID = 'verification:retry';
const MODAL_ID = 'verification:modal';
const ATTEMPT_COOLDOWN_MS = 3000;

const EPHEMERAL = 64;
const sec = ms => Math.floor(ms / 1000);

function retryRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(RETRY_ID).setLabel('Try again').setStyle(ButtonStyle.Primary),
    );
}

function reply(interaction, content, components = []) {
    return interaction.reply({ content, components, flags: EPHEMERAL });
}

async function openQuestion(interaction) {
    const cfg = getConfig();
    const member = interaction.member;

    if (!cfg.adventurerRoleId) {
        return reply(interaction, '❌ Verification isn\'t set up yet. Please ping a moderator.');
    }
    if (service.hasAdventurer(member)) {
        service.clearAll(member.id);
        return reply(interaction, '✅ You\'re already verified. Nothing more to do!');
    }
    if (service.isExempt(member)) {
        return reply(interaction, '✅ You don\'t need to verify.');
    }

    const lockKey = `verification:${member.id}`;
    if (!tryAcquire(lockKey)) {
        return reply(interaction, '⏳ Your question is already opening. Check for the pop-up window.');
    }

    try {
        const now = Date.now();
        const result = store.update(member.id, e => {
            if (e.lockedUntil && e.lockedUntil <= now) {
                e.lockedUntil = null;
                e.attemptsUsed = 0;
            }
            if (e.lockedUntil && e.lockedUntil > now) return { locked: e.lockedUntil };

            if ((e.attemptsUsed || 0) >= cfg.maxAttempts) {
                e.lockedUntil = (e.lastAttemptAt || now) + cfg.lockoutMin * 60_000;
                if (e.lockedUntil > now) return { locked: e.lockedUntil };
                e.lockedUntil = null;
                e.attemptsUsed = 0;
            }

            if (!(e.currentAnswer && e.questionExpiresAt > now)) {
                const problem = generateProblem(e.currentQuestion);
                e.currentQuestion = problem.question;
                e.currentAnswer = problem.answer;
                e.questionExpiresAt = now + cfg.questionTimeLimitMin * 60_000;
                e.abandonLogged = false;
            }
            e.sessionStartedAt = e.sessionStartedAt || now;
            return {
                question: e.currentQuestion,
                expiresAt: e.questionExpiresAt,
                attempt: (e.attemptsUsed || 0) + 1,
            };
        });

        if (result.locked) {
            return reply(interaction, `🔒 Too many wrong answers. You can try again <t:${sec(result.locked)}:R> (at <t:${sec(result.locked)}:t>).`);
        }

        const modal = new ModalBuilder()
            .setCustomId(MODAL_ID)
            .setTitle(`Attempt ${result.attempt} of ${cfg.maxAttempts}`)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `⏳ This question expires <t:${sec(result.expiresAt)}:R>.\nAnswer with digits only, then press Submit.`,
                ),
            )
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel(result.question)
                    .setTextInputComponent(
                        new TextInputBuilder()
                            .setCustomId('answer')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Your answer (digits)')
                            .setMinLength(1)
                            .setMaxLength(4)
                            .setRequired(true),
                    ),
            );

        await interaction.showModal(modal);
    } finally {
        release(lockKey, { holdMs: 1000 });
    }
}

// ─── Modal submit ───────────────────────────────────────────────────────────
async function handleModalSubmit(interaction, client) {
    const cfg = getConfig();
    const member = interaction.member;
    const user = interaction.user;
    const now = Date.now();

    if (service.hasAdventurer(member)) {
        service.clearAll(member.id);
        return reply(interaction, '✅ You\'re already verified. Nothing more to do!');
    }

    const given = parseAnswer(interaction.fields.getTextInputValue('answer'));

    const outcome = store.update(member.id, e => {
        if (!e.currentAnswer || !(e.questionExpiresAt > now)) return { kind: 'expired' };
        if (e.lastAttemptAt && now - e.lastAttemptAt < ATTEMPT_COOLDOWN_MS) return { kind: 'cooldown' };

        e.lastAttemptAt = now;
        const correct = given !== null && given === e.currentAnswer;
        const startedAt = e.sessionStartedAt || now;
        e.currentAnswer = null;

        if (correct) {
            return { kind: 'correct', attempts: (e.attemptsUsed || 0) + 1, startedAt };
        }

        e.attemptsUsed = (e.attemptsUsed || 0) + 1;
        if (e.attemptsUsed >= cfg.maxAttempts) {
            e.lockedUntil = now + cfg.lockoutMin * 60_000;
            e.currentQuestion = null;
            e.questionExpiresAt = null;
            e.sessionStartedAt = null;
            return { kind: 'lockout', retryAt: e.lockedUntil };
        }
        e.questionExpiresAt = now + cfg.questionTimeLimitMin * 60_000;
        e.abandonLogged = false;
        return { kind: 'wrong', left: cfg.maxAttempts - e.attemptsUsed };
    });

    if (outcome.kind === 'expired') {
        return reply(interaction, '⌛ That question expired (this doesn\'t count against you). Press **Start Verification** for a new one.');
    }
    if (outcome.kind === 'cooldown') {
        return reply(interaction, '🐢 Slow down a moment, then try again. (Not counted.)');
    }

    if (outcome.kind === 'wrong') {
        return reply(
            interaction,
            `❌ Not quite. You have **${outcome.left}** attempt${outcome.left === 1 ? '' : 's'} left. The next question will be different.`,
            [retryRow()],
        );
    }

    if (outcome.kind === 'lockout') {
        await log.failed(client, user, { max: cfg.maxAttempts, lockoutMin: cfg.lockoutMin, retryAt: outcome.retryAt });
        return reply(
            interaction,
            `❌ That was your last attempt. You're locked out for **${cfg.lockoutMin} minute${cfg.lockoutMin === 1 ? '' : 's'}**. ` +
            `You can try again <t:${sec(outcome.retryAt)}:R> (at <t:${sec(outcome.retryAt)}:t>). Press **Start Verification** then.`,
        );
    }

    // Correct answer
    await interaction.deferReply({ flags: EPHEMERAL });
    const granted = await service.grantAdventurer(member, 'Passed verification quiz');
    if (!granted.ok) {
        await reportError(client, {
            scope: '[verification]',
            message: `Correct answer from ${user.tag} but the Adventurer role could not be granted`,
            error: new Error(granted.reason),
        });
        return interaction.editReply({
            content: '⚠️ Your answer was correct, but I couldn\'t give you the role. A moderator has been alerted. Please ping one for a manual verify.',
        });
    }

    await log.passed(client, user, {
        attempts: outcome.attempts,
        max: cfg.maxAttempts,
        tookMs: Date.now() - outcome.startedAt,
    });
    return interaction.editReply({ content: '✅ Correct! You\'re verified. Welcome aboard, Adventurer!' });
}

// ─── /verification pending pager ────────────────────────────────────────────
async function handlePendingPage(interaction) {
    if (!isVerificationAdmin(interaction)) {
        return interaction.reply({ content: '❌ You don\'t have permission to do that.', flags: EPHEMERAL });
    }
    const page = parseInt(interaction.customId.slice(PAGER_PREFIX.length), 10);
    await interaction.update(buildPendingPage(Number.isNaN(page) ? 0 : page));
}

module.exports = {
    exact: {
        [START_ID]: openQuestion,
        [RETRY_ID]: openQuestion,
    },
    prefix: {
        [PAGER_PREFIX]: handlePendingPage,
    },
    handleModalSubmit,
    START_ID,
    MODAL_ID,
};
