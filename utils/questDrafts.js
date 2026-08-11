const path = require('path');
const { randomBytes } = require('crypto');
const { createJsonStore } = require('./jsonStore');

const STATUSES = Object.freeze({
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    PARTIALLY_FAILED: 'partially_failed',
});

const LINE_APPLY_STATUSES = Object.freeze({
    PENDING: 'pending',
    APPLIED: 'applied',
    FAILED: 'failed',
});

const LINE_TYPES = Object.freeze(['gold', 'rep', 'item', 'milestone']);

const store = createJsonStore(path.join(__dirname, '../data/questRewardDrafts.json'), {});

function makeLineId() {
    return randomBytes(2).toString('hex');
}

function now() {
    return new Date().toISOString();
}

// ---- read ----
function getAllDrafts() {
    return store.load();
}

function getDraft(questId) {
    const drafts = store.load();
    return drafts[questId] ?? null;
}

function draftExists(questId) {
    return getDraft(questId) !== null;
}

function getLine(questId, lineId) {
    const draft = getDraft(questId);
    if (!draft) return null;
    return draft.lines.find((l) => l.lineId === lineId) ?? null;
}

// Deep copy of a draft's lines, safe to embed in a pendingActions payload.
function snapshotLines(questId) {
	const draft = getDraft(questId);
	if (!draft) return [];
	return JSON.parse(JSON.stringify(draft.lines));
}

function listDraftsByDM(discordId) {
    const drafts = store.load();
    return Object.values(drafts).filter((d) => d.dm?.discordId === discordId);
}

function createDraft(questId, { questPageId, questName, dm }) {
    const drafts = store.load();
    if (drafts[questId]) return drafts[questId];

    const draft = {
        questId,
        questPageId,
        questName,
        dm,
        status: STATUSES.DRAFT,
        createdAt: now(),
        updatedAt: now(),
        lines: [],
    };
    drafts[questId] = draft;
    store.save(drafts);
    return draft;
}

function getOrCreateDraft(questId, meta) {
    return getDraft(questId) ?? createDraft(questId, meta);
}

function addLine(questId, { characterPageId, characterName, discordId, type, payload }) {
    if (!LINE_TYPES.includes(type)) {
        throw new Error(`[questDrafts] Unknown line type "${type}". Expected one of: ${LINE_TYPES.join(', ')}`);
    }

    const drafts = store.load();
    const draft = drafts[questId];
    if (!draft) throw new Error(`[questDrafts] No draft exists for quest "${questId}". Create it first.`);

    const line = {
        lineId: makeLineId(),
        characterPageId,
        characterName,
        discordId,
        type,
        payload,
        addedAt: now(),
        applyStatus: LINE_APPLY_STATUSES.PENDING,
    };
    draft.lines.push(line);
    draft.updatedAt = now();
    store.save(drafts);
    return line;
}

function addOrReplaceLine(questId, { characterPageId, characterName, discordId, type, payload }) {
    if (!LINE_TYPES.includes(type)) {
        throw new Error(`[questDrafts] Unknown line type "${type}". Expected one of: ${LINE_TYPES.join(', ')}`);
    }

    if (type === 'item') {
        const line = addLine(questId, { characterPageId, characterName, discordId, type, payload });
        return { line, replaced: false, previousPayload: null };
    }

    const drafts = store.load();
    const draft = drafts[questId];
    if (!draft) throw new Error(`[questDrafts] No draft exists for quest "${questId}". Create it first.`);

    const existing = draft.lines.find((l) => l.characterPageId === characterPageId && l.type === type);
    if (!existing) {
        const line = addLine(questId, { characterPageId, characterName, discordId, type, payload });
        return { line, replaced: false, previousPayload: null };
    }

    const previousPayload = existing.payload;
    existing.payload = payload;
    existing.characterName = characterName;
    existing.updatedAt = now();
    draft.updatedAt = now();
    store.save(drafts);
    return { line: existing, replaced: true, previousPayload };
}

function updateLine(questId, lineId, updates) {
    const drafts = store.load();
    const draft = drafts[questId];
    if (!draft) return null;

    const line = draft.lines.find((l) => l.lineId === lineId);
    if (!line) return null;

    Object.assign(line, updates);
    draft.updatedAt = now();
    store.save(drafts);
    return line;
}

function removeLine(questId, lineId) {
    const drafts = store.load();
    const draft = drafts[questId];
    if (!draft) return false;

    const before = draft.lines.length;
    draft.lines = draft.lines.filter((l) => l.lineId !== lineId);
    draft.updatedAt = now();
    store.save(drafts);
    return draft.lines.length < before;
}

function markLineApplyStatus(questId, lineId, applyStatus) {
    if (!Object.values(LINE_APPLY_STATUSES).includes(applyStatus)) {
        throw new Error(`[questDrafts] Unknown apply status "${applyStatus}".`);
    }
    return updateLine(questId, lineId, { applyStatus });
}

function setStatus(questId, status) {
    if (!Object.values(STATUSES).includes(status)) {
        throw new Error(`[questDrafts] Unknown draft status "${status}".`);
    }
    const drafts = store.load();
    const draft = drafts[questId];
    if (!draft) return null;

    draft.status = status;
    draft.updatedAt = now();
    store.save(drafts);
    return draft;
}

function restoreDraft(questId) {
    return setStatus(questId, STATUSES.DRAFT);
}

function resetDraft(questId) {
    const drafts = store.load();
    const draft = drafts[questId];
    if (!draft) return null;

    draft.lines = [];
    draft.status = STATUSES.DRAFT;
    draft.updatedAt = now();
    store.save(drafts);
    return draft;
}

function deleteDraft(questId) {
    const drafts = store.load();
    if (!drafts[questId]) return false;
    delete drafts[questId];
    store.save(drafts);
    return true;
}

module.exports = {
    STATUSES,
    LINE_APPLY_STATUSES,
    LINE_TYPES,
    getAllDrafts,
    getDraft,
    draftExists,
    getLine,
    snapshotLines,
    listDraftsByDM,
    createDraft,
    getOrCreateDraft,
    addLine,
    addOrReplaceLine,
    updateLine,
    removeLine,
    markLineApplyStatus,
    setStatus,
    restoreDraft,
    resetDraft,
    deleteDraft,
};
