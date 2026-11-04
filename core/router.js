const auth = require('../shared/auth');
const { findCustomIdRoute } = require('./registry');

// ONE interactionCreate listener for commands, autocomplete, buttons, modals and select menus.
// It looks the route up in the registry, enforces the route's policy, then runs the handler.
//
// The four old routers each behave a little differently when nothing matches or when a handler throws
// (different log labels, different reply texts, silent vs warned). Those differences are preserved on
// purpose in `kinds` below: Phase 3 changes where the code lives, not what users see.

const DEFAULT_DENIED = '❌ You do not have permission to use this command.';
const ephemeral = 64;

const respondTo = (interaction, content, { followUpWhenAnswered }) => {
    const answered = interaction.replied || interaction.deferred;
    if (answered && !followUpWhenAnswered) return null;
    return answered ? interaction.followUp({ content, flags: ephemeral }) : interaction.reply({ content, flags: ephemeral });
};

// Everything that differs between the four old routers, in one table.
const kinds = {
    command: {
        label: 'commandHandler',
        errorLog: (error) => console.error('Error handling interaction:', error),   // logged before the expired check
        expiredId: (i) => i.commandName,
        errorText: 'There was an error while executing this command!',
        followUpWhenAnswered: true,
        unhandled: () => {},
    },
    button: {
        label: 'buttonHandler',
        errorLog: (error, i) => console.error(`[buttonHandler] Error handling button ${i.customId}:`, error),
        expiredId: (i) => i.customId,
        errorText: 'Something went wrong.',
        followUpWhenAnswered: true,
        unhandled: (i) => console.warn(`Unhandled button: ${i.customId}`),
        expiredFirst: true,
    },
    modal: {
        label: 'modalHandler',
        errorLog: (error) => console.error('Error handling modal:', error),
        expiredId: (i) => i.customId,
        errorText: 'There was an error processing your submission!',
        followUpWhenAnswered: false,
        unhandled: async (i) => {
            console.warn(`[modalHandler] Unhandled modal submission: ${i.customId}`);
            if (!i.replied && !i.deferred) await i.reply({ content: '❌ This form isn\'t wired up yet.', flags: ephemeral });
        },
        expiredFirst: true,
    },
    select: {
        label: 'selectHandler',
        errorLog: (error) => console.error('Error handling select menu:', error),
        expiredId: (i) => i.customId,
        errorText: 'Something went wrong.',
        followUpWhenAnswered: true,
        unhandled: () => {},
        expiredFirst: true,
    },
};
kinds.userSelect = kinds.select;

function kindOf(interaction) {
    if (interaction.isChatInputCommand?.()) return 'command';
    if (interaction.isButton?.()) return 'button';
    if (interaction.isModalSubmit?.()) return 'modal';
    if (interaction.isUserSelectMenu?.()) return 'userSelect';
    if (interaction.isStringSelectMenu?.()) return 'select';
    return null;
}

function createRouter(registry, { can = auth.can } = {}) {
    async function deny(interaction, kindName, spec) {
        await respondTo(interaction, spec.denied ?? DEFAULT_DENIED, { followUpWhenAnswered: kinds[kindName].followUpWhenAnswered });
    }

    // Runs `run`, with the error handling of the given kind. Returns nothing.
    async function guarded(interaction, kindName, run) {
        const kind = kinds[kindName];
        try {
            await run();
        } catch (error) {
            if (!kind.expiredFirst) kind.errorLog(error, interaction);
            if (error.code === 10062) {
                console.warn(`[${kind.label}] Interaction expired before we could respond: ${kind.expiredId(interaction)}`);
                return;
            }
            if (kind.expiredFirst) kind.errorLog(error, interaction);
            try {
                await respondTo(interaction, kind.errorText, { followUpWhenAnswered: kind.followUpWhenAnswered });
            } catch (replyError) {
                console.warn(`[${kind.label}] Fallback reply also failed:`, replyError.message);
            }
        }
    }

    function commandSpec(interaction) {
        const cmd = registry.commands.get(interaction.commandName);
        if (!cmd) return null;
        const group = interaction.options?.getSubcommandGroup?.(false);
        const sub = interaction.options?.getSubcommand?.(false);
        const key = sub ? (group ? `${group} ${sub}` : sub) : null;
        const override = key && cmd.subcommands?.[key];
        return { cmd, policy: override?.policy ?? cmd.policy, denied: override?.denied ?? cmd.denied };
    }

    async function handleAutocomplete(interaction, client) {
        const cmd = registry.commands.get(interaction.commandName);
        const entry = cmd?.autocomplete?.find(e => !e.when || e.when(interaction));
        if (!entry) return;
        if (!can(entry.policy, interaction)) { await interaction.respond([]); return; }
        await entry.handle(interaction, client);   // like today, errors are left to the process-level handler
    }

    async function handleCommand(interaction, client) {
        if (!interaction.guild) return;
        const found = commandSpec(interaction);
        if (!found) return;
        await guarded(interaction, 'command', async () => {
            if (!can(found.policy, interaction)) return deny(interaction, 'command', found);
            await found.cmd.handler(interaction, client);
        });
    }

    async function handleCustomId(interaction, client, kindName) {
        const spec = findCustomIdRoute(registry, kindName, interaction.customId);
        if (!spec) return guarded(interaction, kindName, () => kinds[kindName].unhandled(interaction));
        await guarded(interaction, kindName, async () => {
            if (!can(spec.policy, interaction)) return deny(interaction, kindName, spec);
            const result = await spec.handler(interaction, client);
            if (spec.falseMeansUnhandled && result === false) await kinds[kindName].unhandled(interaction);
        });
    }

    async function handle(interaction, client) {
        if (interaction.isAutocomplete?.()) return handleAutocomplete(interaction, client);
        const kindName = kindOf(interaction);
        if (!kindName) return;
        if (kindName === 'command') return handleCommand(interaction, client);
        return handleCustomId(interaction, client, kindName);
    }

    // The single listener. Not called from index.js until Phase 3 step 3.
    function install(client) {
        client.on('interactionCreate', (interaction) => handle(interaction, client));
    }

    return { handle, install };
}

module.exports = { createRouter, DEFAULT_DENIED };
