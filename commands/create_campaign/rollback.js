const { ChannelType } = require('discord.js');
const { sleep, describeError } = require('./helpers');

// ── Rollback ────────────────────────────────────────────────────────────────
async function deleteWithRetry(object, reason) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            await object.delete(reason);
            return { ok: true, note: attempt > 1 ? 'deleted on retry' : 'deleted' };
        } catch (err) {
            if (err?.code === 10003 || err?.code === 10011) return { ok: true, note: 'was already gone' };
            lastError = err;
            if (attempt < 2) await sleep(1500);
        }
    }
    return { ok: false, error: lastError };
}

async function rollback(guild, created, plan) {
    const entries = [];
    const steps = [
        ['voice/stage channel', created.voice],
        ['text channel',        created.text],
        ['category',            created.category],
        ['role',                created.role],
    ];

    for (const [kind, object] of steps) {
        if (!object) continue;
        const label = `Delete ${kind} "${object.name}"`;
        const result = await deleteWithRetry(object, 'create_campaign rollback');
        if (result.ok) {
            entries.push({ status: 'rolledback', label, detail: `${result.note} (\`${object.id}\`)` });
            console.log(`[create_campaign] 🗑️ Rollback: ${label} — ${result.note}`);
        } else {
            entries.push({
                status: 'rbfailed',
                incomplete: true,
                label,
                detail: `FAILED: ${describeError(result.error)} — delete it manually (id \`${object.id}\`)`,
            });
            console.error(`[create_campaign] 🚨 Rollback failed: ${label}`, result.error);
        }
    }

    try {
        const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
        const lower = plan.baseName.toLowerCase();
        const voiceLower = plan.voiceName.toLowerCase();
        const found = [];
        roles.forEach(r => {
            if (r.name.toLowerCase() === lower) found.push(`role "${r.name}" (\`${r.id}\`)`);
        });
        channels.forEach(c => {
            if (!c) return;
            const n = c.name.toLowerCase();
            if (c.type === ChannelType.GuildCategory && n === lower) {
                found.push(`category "${c.name}" (\`${c.id}\`)`);
            } else if (c.type === ChannelType.GuildText && n === plan.textName) {
                found.push(`text channel "${c.name}" (\`${c.id}\`)`);
            } else if ((c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) && n === voiceLower) {
                found.push(`voice/stage channel "${c.name}" (\`${c.id}\`)`);
            }
        });
        if (found.length) {
            entries.push({ status: 'warn', incomplete: true, label: 'Leftover check', detail: `still in the server, delete manually: ${found.join('; ')}` });
        } else {
            entries.push({ status: 'ok', label: 'Leftover check', detail: "nothing with this campaign's names remains in the server" });
        }
    } catch (err) {
        entries.push({ status: 'warn', incomplete: true, label: 'Leftover check', detail: `could not verify the server is clean: ${describeError(err)}` });
    }

    return entries;
}

module.exports = {
    rollback,
};
