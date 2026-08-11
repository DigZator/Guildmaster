const { adjustCharacterNumber, createInventoryItem, getActiveCharacter } = require('./leagueNotion');
const { applyMilestones } = require('./milestones');

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS = 500;

// ── Retry helper ──────────────────────────────────────────────────────────

async function withRetry(fn, { attempts = DEFAULT_RETRY_ATTEMPTS, backoffMs = DEFAULT_RETRY_BACKOFF_MS } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, backoffMs * attempt));
            }
        }
    }
    throw lastErr;
}

// ── Per-type appliers ─────────────────────────────────────────────────────

async function applyGoldLine(line, ctx) {
    const { characterPageId, payload } = line;
    const { amount } = payload;

    await adjustCharacterNumber(characterPageId, 'Gold', amount);
    if (ctx.entry.quest?.questPageId) {
        await adjustCharacterNumber(ctx.entry.quest.questPageId, 'Gold Awarded', amount);
    }
    return { summary: `${amount > 0 ? '+' : ''}${amount} gp` };
}

async function applyRepLine(line, _ctx) {
    const { characterPageId, payload } = line;
    const { amount } = payload;

    await adjustCharacterNumber(characterPageId, 'Reputation Points', amount);
    return { summary: `+${amount} rep` };
}

async function applyMilestoneLine(line, ctx) {
    const { discordId, characterName, payload } = line;
    const { amount } = payload;

    const character = await getActiveCharacter(discordId);
    if (!character) {
        throw new Error(`${characterName} no longer has an active character.`);
    }

    const result = await applyMilestones(ctx.client, ctx.guild, character, characterName, amount);
    const { currentLevel, newLevel, milestonesConsumed, milestonesRemaining, levelUps } = result;
    const levelMsg = levelUps > 0 ? ` (Level ${currentLevel} → ${newLevel})` : '';
    return {
        summary: `+${amount} milestone(s), ${milestonesConsumed} consumed, ${milestonesRemaining} remaining${levelMsg}`,
        raw: result,
    };
}

async function applyItemLine(line, ctx) {
    const { characterPageId, payload } = line;
    const { itemName, type, subtype, rarity, itemValue, source, notes } = payload;

    const page = await createInventoryItem({
        itemName, type, subtype, rarity, itemValue, source, notes,
        characterPageId,
        sourceQuestId: ctx.entry.quest?.questPageId ?? null,
        status: 'Owned',
    });
    return { summary: `${itemName} (${rarity})`, notionId: page.id };
}

const APPLIERS = {
    gold: applyGoldLine,
    rep: applyRepLine,
    milestone: applyMilestoneLine,
    item: applyItemLine,
};

// ── Admin-only single-line rejection (pre-approval correction) ───────────

function rejectReportLine(entry, lineId, reason) {
    if (!Array.isArray(entry.payload?.lines)) {
        throw new Error(`[questReportAppliers] Entry ${entry.id} has no reward lines to reject.`);
    }
    const line = entry.payload.lines.find(l => l.lineId === lineId);
    if (!line) {
        throw new Error(`[questReportAppliers] No line "${lineId}" found on report ${entry.id}.`);
    }
    if (line.lineStatus === 'rejected') {
        return line;
    }

    line.lineStatus = 'rejected';
    line.rejectedReason = reason;
    line.rejectedAt = new Date().toISOString();
    return line;
}

// ── Bundled report ───────────────────────────────────────────

async function applyReportLines(entry, { client, guild, retry } = {}) {
    if (!Array.isArray(entry.payload?.lines)) {
        throw new Error(`[questReportAppliers] Entry ${entry.id} has no reward lines to apply.`);
    }

    const ctx = { entry, client, guild };
    const applied = [];
    const failed = [];
    const skipped = [];

    for (const line of entry.payload.lines) {
        if (line.lineStatus === 'rejected') {
            skipped.push(line);
            continue;
        }
        if (line.applyStatus === 'applied') {
            applied.push(line);
            continue;
        }

        const applier = APPLIERS[line.type];
        if (!applier) {
            line.applyStatus = 'failed';
            line.applyError = `Unknown line type "${line.type}".`;
            failed.push(line);
            continue;
        }

        try {
            const result = await withRetry(() => applier(line, ctx), retry);
            line.applyStatus = 'applied';
            line.applyResult = result.summary;
            delete line.applyError;
            applied.push(line);
        } catch (err) {
            line.applyStatus = 'failed';
            line.applyError = err.message;
            failed.push(line);
        }
    }

    return {
        applied,
        failed,
        skipped,
        allResolved: failed.length === 0,
    };
}

module.exports = {
    withRetry,
    applyGoldLine,
    applyRepLine,
    applyMilestoneLine,
    applyItemLine,
    rejectReportLine,
    applyReportLines,
};
